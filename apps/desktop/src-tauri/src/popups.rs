use std::collections::VecDeque;
use std::sync::Mutex;
use std::time::Instant;

use tauri::webview::WebviewWindowBuilder;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow};

use crate::activity;
use crate::bridge::{self, PopupPayload, PopupReply};

/// Геометрия попапа (логические px): карточка ~360×88 (аватар 40, имя
/// вверху, 2 строки превью, воздух снизу pb-3.5), с полем ответа ~360×124.
/// Окно прозрачное — скругления несёт карточка; скролл запрещён в UI.
pub(crate) const POPUP_W: f64 = 360.0;
pub(crate) const POPUP_H: f64 = 88.0;
pub(crate) const POPUP_H_REPLY: f64 = 124.0;
pub(crate) const HIDE_ALL_H: f64 = 28.0;
pub(crate) const MARGIN: f64 = 14.0;
pub(crate) const GAP: f64 = 5.0;
/// Максимум в столбик (фидбек 08.10, модель Telegram: «не более трёх, каждое
/// следующее заменяет старейшее как очередь»).
pub(crate) const MAX_STACK: u32 = 3;
/// Метка окна «Скрыть все» над стеком (Telegram HideAllButton).
pub(crate) const HIDE_ALL_LABEL: &str = "popup-hide-all";

pub(crate) struct ActivePopup {
    pub(crate) label: String,
    pub(crate) slot: u32,
    /// Монотонный номер показа — жёсткий порядок «новейший внизу»
    /// (Instant имеет грубое разрешение на Windows, counter — нет).
    pub(crate) counter: u64,
    conversation_id: String,
    pub(crate) created_ms: u64,
    /// Начало текущего угасания (None — полная яркость).
    pub(crate) fading: Option<Instant>,
    /// Курсор на попапе: угасание на паузе, яркость восстановлена.
    pub(crate) hover: bool,
    /// Открыто поле ответа: не гасим (пользователь печатает).
    pub(crate) replying: bool,
    /// Payload для pull-модели: окно забирает данные само после загрузки
    /// (push-событие проигрывал бы гонку со скоростью монтирования React).
    payload: serde_json::Value,
}

/// Стек попапов: слоты 0..3 от право-низа вверх + очередь переполнения.
/// Поведение (фидбек владельца 08.10, модель Telegram Desktop):
/// - на экране ≤3; новое при полном стеке ЗАКРЫВАЕТ старейший спокойный
///   (hover/поле ответа не трогаем) и занимает его место;
/// - пользователь неактивен (нет кликов/клавиш) — попапы не угасают никогда;
/// - активность (клик/клавиша, НЕ движение мыши) — медленное угасание ~3 c
///   (CSS transition в окне), hover возвращает яркость и держит паузу;
/// - над стеком плашка «Скрыть все».
#[derive(Default)]
pub(crate) struct PopupStack {
    pub(crate) counter: u64,
    pub(crate) active: Vec<ActivePopup>,
    pub(crate) pending: VecDeque<PopupPayload>,
    /// Окно «Скрыть все» живёт (флаг под мьютексом — гонка двух
    /// reposition_all успевала создать ОКНО-ДУБЛЬ, висевшее поверх стека).
    pub(crate) hide_all_live: bool,
}

impl PopupStack {
    fn free_slot(&self) -> Option<u32> {
        (0..MAX_STACK).find(|k| !self.active.iter().any(|p| p.slot == *k))
    }
    /// Старейший попап без hover/поля ответа — кандидат на вытеснение.
    fn eviction_victim(&self) -> Option<String> {
        self.active
            .iter()
            .filter(|p| !p.hover && !p.replying)
            .min_by_key(|p| p.counter)
            .map(|p| p.label.clone())
    }
}

pub(crate) fn stack(app: &AppHandle) -> std::sync::MutexGuard<'_, PopupStack> {
    app.state::<Mutex<PopupStack>>().inner().lock().unwrap()
}

/// Показать попап. Вызывать ТОЛЬКО из async-команд: на Windows билдер окна
/// в синхронном контексте дедлокит WebView2 (см. bridge::notify_popup).
pub(crate) fn show(app: &AppHandle, payload: crate::bridge::PopupPayload) {
    let payload_json = serde_json::json!({
        "id": payload.id,
        "conversationId": payload.conversation_id,
        "title": payload.title,
        "avatarUrl": payload.avatar_url,
        "preview": payload.preview,
        "previewAttachment": payload.preview_attachment.unwrap_or(false),
        "urgent": payload.urgent,
        "canReply": payload.can_reply,
    });
    let conversation_id = payload.conversation_id.clone();
    let (label, _slot) = {
        let mut s = stack(app);
        // Полный стек: новое вытесняет старейший спокойный (очередь-сдвиг);
        // сплошь hover/печать — уходим в очередь, докат при закрытии.
        if s.free_slot().is_none() {
            match s.eviction_victim() {
                Some(victim) => {
                    if let Some(w) = app.get_webview_window(&victim) {
                        let _ = w.close();
                    }
                    s.active.retain(|p| p.label != victim);
                }
                None => {
                    s.pending.push_back(payload);
                    log::info!("стек занят активным пользователем — попап в очереди");
                    return;
                }
            }
        }
        let slot = s.free_slot().expect("освободили слот выше");
        s.counter += 1;
        let counter = s.counter;
        let label = format!("popup-{counter}");
        s.active.push(ActivePopup {
            label: label.clone(),
            slot,
            counter,
            conversation_id,
            created_ms: activity::monotonic_ms(),
            fading: None,
            hover: false,
            replying: false,
            payload: payload_json,
        });
        (label, slot)
    };
    // Невидимое окно: позицию даст reposition_all (кумулятив по стеку),
    // затем показ. Кражу фокуса подавляет WS_EX_NOACTIVATE — своя
    // SW_SHOWNOACTIVATE ломала рендер (системная рамка + чёрный фон).
    let win = build_popup_window(app, &label, POPUP_H);
    crate::layout::reposition_all(app);
    if let Some(win) = win {
        let _ = win.show();
    }
    crate::fade::spawn_fade_ticker(app);
}

/// Общий билдер popup-окон (карточка + плашка «Скрыть все»). Окно НЕАКТИВИ-
/// РУЕМОЕ (WS_EX_NOACTIVATE, канон Telegram и Raymond Chen / Old New Thing):
/// показ и клики НЕ крадут фокус у портала — супер-курсор композера живёт.
/// Для печати в поле ответа флаг снимается (popup_set_expanded → allow_focus).
pub(crate) fn build_popup_window(app: &AppHandle, label: &str, height: f64) -> Option<WebviewWindow> {
    let win = match WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title("Nodus")
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .focused(false)
        .inner_size(POPUP_W, height)
        .visible(false)
        // Прозрачное окно: скруглённые углы и тень рисует карточка (CSS).
        .transparent(true)
        .shadow(false)
        .build()
    {
        Ok(win) => win,
        Err(e) => {
            log::error!("попап не создан: {e}");
            stack(app).active.retain(|p| p.label != label);
            return None;
        }
    };
    set_noactivate(&win, true);
    // Тема попапа = тема ПРИЛОЖЕНИЯ (портал сообщил через set_ui_theme).
    crate::bridge::apply_ui_theme(&win);
    Some(win)
}

/// WS_EX_NOACTIVATE на топ-левел окно попапа (GWL_EXSTYLE).
const WS_EX_NOACTIVATE: isize = 0x0800_0000;

fn set_noactivate(win: &WebviewWindow, on: bool) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE,
    };
    let Ok(hwnd) = win.hwnd() else { return };
    let hwnd = HWND(hwnd.0);
    unsafe {
        let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let next = if on {
            style | WS_EX_NOACTIVATE
        } else {
            style & !WS_EX_NOACTIVATE
        };
        if next != style {
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, next);
        }
    }
}

/// Вернуть фокус окну портала: клик по попапу глушит каретку композера
/// (blur документа) — после закрытия попапа руками вернём фокус порталу,
/// супер-курсор поднимется сам.
fn refocus_portal(app: &AppHandle) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
    if let Some(main) = app.get_webview_window("main") {
        // Возвращаем фокус ТОЛЬКО если портал сейчас в фокусе системы
        // (пользователь печатал в нём). Перекрытый другим окном / свёрнутый /
        // в трее портал не трогаем: клик по попапу = «пользователь занят»,
        // поднимать окно поверх чужого нельзя (фидбек 08.10). Попап не
        // активируется (WS_EX_NOACTIVATE), поэтому foreground не менялся.
        let Ok(hwnd) = main.hwnd() else { return };
        unsafe {
            if GetForegroundWindow() != HWND(hwnd.0) {
                return;
            }
        }
        let _ = main.set_focus();
    }
}

pub fn on_popup_destroyed(app: &AppHandle, label: &str) {
    let next: Option<PopupPayload> = {
        let mut s = stack(app);
        s.active.retain(|p| p.label != label);
        if s.active.len() < MAX_STACK as usize {
            s.pending.pop_front()
        } else {
            None
        }
    };
    // Хвост (док очереди строит ОКНО, reposition двигает/создаёт капсулу) —
    // ТОЛЬКО из async-контекста: сюда приходит синхронный обработчик
    // WindowEvent::Destroyed (event loop, main thread) — создание окна здесь
    // дедлокит WebView2 (gotcha «Десктоп», docs/gotchas.md).
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Some(payload) = next {
            show(&app, payload); // show завершает reposition_all
        } else {
            crate::layout::reposition_all(&app);
        }
    });
}

/// Погасить попапы беседы: портал зовёт при открытии беседы (модель
/// Telegram unlinkHistory — открыл чат, его уведомления больше не висят).
pub fn dismiss_for_conversation(app: &AppHandle, conversation_id: &str) {
    let labels: Vec<String> = {
        let mut s = stack(app);
        s.pending.retain(|p| p.conversation_id != conversation_id);
        s.active
            .iter()
            .filter(|p| p.conversation_id == conversation_id)
            .map(|p| p.label.clone())
            .collect()
    };
    for label in labels {
        if let Some(w) = app.get_webview_window(&label) {
            let _ = w.close();
        }
    }
}

/// «Скрыть все»: закрыть стек и очередь (бейджи не трогаем — их ведёт портал).
#[tauri::command]
pub fn popup_close_all(app: AppHandle) {
    let labels: Vec<String> = {
        let mut s = stack(&app);
        s.pending.clear();
        s.hide_all_live = false;
        s.active.iter().map(|p| p.label.clone()).collect()
    };
    for label in labels {
        if let Some(w) = app.get_webview_window(&label) {
            let _ = w.close();
        }
    }
    if let Some(w) = app.get_webview_window(HIDE_ALL_LABEL) {
        let _ = w.close();
    }
    refocus_portal(&app);
}

/// Курсор на попапе (mouseenter/leave из UI): пауза угасания + возврат
/// яркости; уход курсора возобновляет угасание с нуля (~3 c заново).
#[tauri::command]
pub fn popup_set_hover(app: AppHandle, window: WebviewWindow, hover: bool) {
    let label = window.label().to_string();
    let mut s = stack(&app);
    if let Some(p) = s.active.iter_mut().find(|p| p.label == label) {
        p.hover = hover;
        if !hover {
            p.fading = None; // ушли курсором — таймер заново с полной яркости
        }
    }
}

/// Плашка «Скрыть все» над стеком: см. place_hide_all (вызывается из
/// reposition_all).

/// Payload попапа — pull-моделью после загрузки окна (без гонки со маунтом).
#[tauri::command]
pub fn popup_get_data(app: AppHandle, window: WebviewWindow) -> Option<serde_json::Value> {
    let label = window.label();
    stack(&app)
        .active
        .iter()
        .find(|p| p.label == label)
        .map(|p| p.payload.clone())
}

/// Закрыть попап — вызывает само окно (крестик/Esc/после действия).
/// Клики по попапу глушат каретку портала (blur) — возвращаем фокус.
#[tauri::command]
pub fn popup_close(app: AppHandle, window: WebviewWindow) {
    let _ = window.close();
    refocus_portal(&app);
}

/// Высота окна под режим ответа: кумулятив в reposition_all поднимет верхние.
/// Открыли поле — снимаем NOACTIVATE и даём фокус (пользователь явно кликнул
/// «Ответить»: печать требует активного окна); закрытие поля — обратно.
#[tauri::command]
pub fn popup_set_expanded(app: AppHandle, window: WebviewWindow, expanded: bool) {
    let label = window.label().to_string();
    {
        let mut s = stack(&app);
        if let Some(p) = s.active.iter_mut().find(|p| p.label == label) {
            p.replying = expanded;
        }
    }
    set_noactivate(&window, !expanded);
    if expanded {
        let _ = window.set_focus();
    }
    crate::layout::reposition_all(&app);
}

#[tauri::command]
pub fn popup_submit_reply(
    app: AppHandle,
    window: WebviewWindow,
    payload: PopupReply,
) -> Result<(), String> {
    // Граница контракта на Rust-стороне (security-аудит #254): попап-UI
    // доверенный, но зеркало обязано валидировать само.
    if payload.text.trim().is_empty()
        || payload.text.chars().count() > 4000
        || payload.id.len() > 200
        || !bridge::is_valid_conversation(&payload.conversation_id)
    {
        return Err("invalid_payload".into());
    }
    bridge::push_to_portal(&app, "popup-reply", &payload);
    let _ = window.close();
    Ok(())
}

#[tauri::command]
pub fn popup_open(
    app: AppHandle,
    window: WebviewWindow,
    conversation_id: String,
) -> Result<(), String> {
    if !bridge::is_valid_conversation(&conversation_id) {
        return Err("invalid_payload".into());
    }
    crate::show_main(&app);
    bridge::push_to_portal(
        &app,
        "open-conversation",
        &serde_json::json!({ "conversationId": conversation_id }),
    );
    let _ = window.close();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn payload(id: &str, conversation_id: &str) -> PopupPayload {
        PopupPayload {
            id: id.into(),
            conversation_id: conversation_id.into(),
            title: "Автор".into(),
            avatar_url: None,
            preview: "текст".into(),
            preview_attachment: None,
            urgent: false,
            can_reply: true,
        }
    }

    fn occupy(s: &mut PopupStack, n: u32) {
        for k in 0..n {
            let slot = s.free_slot().expect("свободный слот");
            s.counter += 1;
            s.active.push(ActivePopup {
                label: format!("popup-{k}"),
                slot,
                counter: k as u64,
                conversation_id: format!("conv-{k}"),
                created_ms: 0,
                fading: None,
                hover: false,
                replying: false,
                payload: serde_json::Value::Null,
            });
        }
    }

    #[test]
    fn полное_меньше_трёх() {
        let mut s = PopupStack::default();
        occupy(&mut s, 2);
        assert!(s.free_slot().is_some());
        occupy(&mut s, 1);
        assert!(s.free_slot().is_none(), "максимум 3 в столбик");
    }

    #[test]
    fn вытеснение_берёт_старейший_спокойный() {
        let mut s = PopupStack::default();
        occupy(&mut s, 3);
        // Первый — под печать, второй — под курсором: жертва третий.
        s.active[0].replying = true;
        s.active[1].hover = true;
        assert_eq!(s.eviction_victim().as_deref(), Some("popup-2"));
        // Все заняты пользователем — жертв нет.
        s.active[2].hover = true;
        assert!(s.eviction_victim().is_none());
    }

    #[test]
    fn очередь_и_dismiss() {
        let mut s = PopupStack::default();
        s.pending.push_back(payload("m1", "conv-1"));
        s.pending.push_back(payload("m2", "conv-2"));
        s.pending.retain(|p| p.conversation_id != "conv-1");
        assert_eq!(s.pending.pop_front().map(|p| p.id), Some("m2".into()));
    }
}
