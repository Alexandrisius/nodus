use std::collections::VecDeque;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::webview::WebviewWindowBuilder;
use tauri::{AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindow};

use crate::activity;
use crate::bridge::{self, PopupPayload, PopupReply};

/// Геометрия попапа (логические px): карточка ~360×88 (аватар 40, имя
/// вверху, 2 строки превью, воздух снизу pb-3.5), с полем ответа ~360×124.
/// Окно прозрачное — скругления несёт карточка; скролл запрещён в UI.
const POPUP_W: f64 = 360.0;
const POPUP_H: f64 = 88.0;
const POPUP_H_REPLY: f64 = 124.0;
const HIDE_ALL_H: f64 = 28.0;
const MARGIN: f64 = 14.0;
const GAP: f64 = 10.0;
/// Максимум в столбик (фидбек 08.10, модель Telegram: «не более трёх, каждое
/// следующее заменяет старейшее как очередь»).
const MAX_STACK: u32 = 3;
/// Полное угасание с момента активности пользователя (~3 c, медленно).
const FADE_MS: u64 = 3000;
/// Период тикера угасания (плавность стартует CSS-transition, тикер — арбитр).
const TICK_MS: u64 = 120;
/// Метка окна «Скрыть все» над стеком (Telegram HideAllButton).
const HIDE_ALL_LABEL: &str = "popup-hide-all";

struct ActivePopup {
    label: String,
    slot: u32,
    /// Монотонный номер показа — жёсткий порядок «новейший внизу»
    /// (Instant имеет грубое разрешение на Windows, counter — нет).
    counter: u64,
    conversation_id: String,
    created_ms: u64,
    /// Начало текущего угасания (None — полная яркость).
    fading: Option<Instant>,
    /// Курсор на попапе: угасание на паузе, яркость восстановлена.
    hover: bool,
    /// Открыто поле ответа: не гасим (пользователь печатает).
    replying: bool,
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
pub struct PopupStack {
    counter: u64,
    active: Vec<ActivePopup>,
    pending: VecDeque<PopupPayload>,
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

fn stack(app: &AppHandle) -> std::sync::MutexGuard<'_, PopupStack> {
    app.state::<Mutex<PopupStack>>().inner().lock().unwrap()
}

/// Показать попап. Вызывать ТОЛЬКО из async-команд: на Windows билдер окна
/// в синхронном контексте дедлокит WebView2 (см. bridge::notify_popup).
pub fn show(app: &AppHandle, payload: PopupPayload) {
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
    spawn_fade_ticker(app);

    // Невидимое окно: позицию даст reposition_all (кумулятив по стеку),
    // затем показ — без мигания из центра.
    let win = build_popup_window(app, &label, POPUP_H);
    reposition_all(app);
    if let Some(win) = win {
        let _ = win.show();
    }
}

/// Общий билдер popup-окон (карточка + плашка «Скрыть все»). Окно НЕАКТИВИ-
/// РУЕМОЕ (WS_EX_NOACTIVATE, канон Telegram и Raymond Chen / Old New Thing):
/// показ и клики НЕ крадут фокус у портала — супер-курсор композера живёт.
/// Для печати в поле ответа флаг снимается (popup_set_expanded → allow_focus).
fn build_popup_window(app: &AppHandle, label: &str, height: f64) -> Option<WebviewWindow> {
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

/// JS-сигнал в окно попапа (fade старт/сброс): попап-UI вешает глобальную
/// `window.__popupFade(phase)` — мост portal-bridge сюда не инъектируется.
fn eval_popup_js(app: &AppHandle, label: &str, js: &str) {
    if let Some(w) = app.get_webview_window(label) {
        let _ = w.eval(js);
    }
}

/// Один общий тикер угасания на процесс (первый попап запускает).
fn spawn_fade_ticker(app: &AppHandle) {
    static STARTED: std::sync::Once = std::sync::Once::new();
    STARTED.call_once(|| {
        let app = app.clone();
        std::thread::spawn(move || loop {
            std::thread::sleep(Duration::from_millis(TICK_MS));
            tick_fade(&app);
        });
    });
}

/// Арбитр угасания: решает по глобальной активности (клик/клавиша) и
/// состоянию попапа (hover/печать), CSS в окне делает плавность.
fn tick_fade(app: &AppHandle) {
    let mut to_close: Vec<String> = Vec::new();
    let mut queued: Option<PopupPayload> = None;
    {
        let mut s = stack(app);
        let last_input = activity::last_input_ms();
        for p in s.active.iter_mut() {
            if p.hover || p.replying {
                if p.fading.take().is_some() {
                    eval_popup_js(
                        app,
                        &p.label,
                        "window.__popupFade&&window.__popupFade('reset')",
                    );
                }
                continue;
            }
            // Неактивен (нет кликов/клавиш после показа) — не угасаем никогда;
            // активность пришла — медленное угасание с этого тика (~3 c).
            let activity_after_show = last_input >= p.created_ms;
            if !activity_after_show {
                if p.fading.take().is_some() {
                    eval_popup_js(
                        app,
                        &p.label,
                        "window.__popupFade&&window.__popupFade('reset')",
                    );
                }
                continue;
            }
            if p.fading.is_none() {
                p.fading = Some(Instant::now());
                eval_popup_js(
                    app,
                    &p.label,
                    "window.__popupFade&&window.__popupFade('start')",
                );
            } else if p
                .fading
                .is_some_and(|t| t.elapsed() >= Duration::from_millis(FADE_MS))
            {
                to_close.push(p.label.clone());
            }
        }
        s.active.retain(|p| !to_close.contains(&p.label));
        if s.active.len() < MAX_STACK as usize {
            queued = s.pending.pop_front();
        }
    }
    let had_closes = !to_close.is_empty();
    for label in to_close {
        if let Some(w) = app.get_webview_window(&label) {
            let _ = w.close();
        }
    }
    if let Some(payload) = queued {
        show(app, payload);
    } else if had_closes {
        reposition_all(app);
    }
}

/// ЕДИНЫЙ раскладчик стека (фидбек 08.10): один проход решает всё —
/// порядок по счёту показа (новейший у ПОЛА), позиции КУМУЛЯТИВНО по
/// фактическим высотам (разросшийся «Ответить» приподнимает верхние —
/// дыр и наездов не бывает), «Скрыть все» только над ПОЛНЫМ столбиком
/// (смысл — быстро убрать 3 попапа; фидбек 08.10 п.4).
fn reposition_all(app: &AppHandle) {
    use tauri::LogicalSize;
    let plan: Vec<(String, i32, i32, f64)> = {
        let cursor = app.cursor_position().ok();
        let monitor = cursor
            .and_then(|c| app.monitor_from_point(c.x, c.y).ok())
            .flatten();
        let Some(monitor) = monitor else { return };
        let scale = monitor.scale_factor();
        let wa = monitor.work_area();
        let px = |v: f64| (v * scale).round() as i32;
        let x = wa.position.x + wa.size.width as i32 - px(POPUP_W) - px(MARGIN);
        // Низ стека — над панелью задач; идём снизу вверх: новейший первым.
        let mut bottom = wa.position.y + wa.size.height as i32 - px(MARGIN);
        let mut s = stack(app);
        let mut order: Vec<&mut ActivePopup> = s.active.iter_mut().collect();
        order.sort_by(|a, b| b.counter.cmp(&a.counter));
        let mut plan = Vec::new();
        for p in order.iter_mut() {
            let h = if p.replying { POPUP_H_REPLY } else { POPUP_H };
            let ph = px(h);
            let y = bottom - ph;
            plan.push((p.label.clone(), x, y, h));
            p.slot = plan.len() as u32 - 1;
            bottom = bottom - ph - px(GAP);
        }
        plan
    };
    for (label, x, y, h) in plan {
        if let Some(w) = app.get_webview_window(&label) {
            let _ = w.set_size(tauri::Size::Logical(LogicalSize::new(POPUP_W, h)));
            let _ = w.set_position(PhysicalPosition::new(x, y));
        }
    }
    place_hide_all(app);
}

/// Окно «Скрыть все»: строго над верхним попапом с тем же зазором, что
/// между карточками; живёт только при полном столбике (len == MAX_STACK).
fn place_hide_all(app: &AppHandle) {
    use tauri::LogicalSize;
    let (len, x, y) = {
        let cursor = app.cursor_position().ok();
        let Some(monitor) = cursor.and_then(|c| app.monitor_from_point(c.x, c.y).ok()).flatten()
        else {
            return;
        };
        let scale = monitor.scale_factor();
        let wa = monitor.work_area();
        let px = |v: f64| (v * scale).round() as i32;
        let x = wa.position.x + wa.size.width as i32 - px(POPUP_W) - px(MARGIN);
        let mut bottom = wa.position.y + wa.size.height as i32 - px(MARGIN);
        let s = stack(app);
        let mut order: Vec<&ActivePopup> = s.active.iter().collect();
        order.sort_by(|a, b| b.counter.cmp(&a.counter));
        let mut top: Option<i32> = None;
        for p in &order {
            let h = px(if p.replying { POPUP_H_REPLY } else { POPUP_H });
            top = Some(bottom - h);
            bottom = bottom - h - px(GAP);
        }
        match top {
            Some(top) => (order.len(), x, top - px(HIDE_ALL_H)),
            None => (0, x, 0),
        }
    };
    if len < MAX_STACK as usize {
        if let Some(w) = app.get_webview_window(HIDE_ALL_LABEL) {
            let _ = w.close();
        }
        return;
    }
    if app.get_webview_window(HIDE_ALL_LABEL).is_none() {
        build_popup_window(app, HIDE_ALL_LABEL, HIDE_ALL_H);
    }
    if let Some(win) = app.get_webview_window(HIDE_ALL_LABEL) {
        let _ = win.set_size(tauri::Size::Logical(LogicalSize::new(POPUP_W, HIDE_ALL_H)));
        let _ = win.set_position(PhysicalPosition::new(x, y));
        let _ = win.show();
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
    if let Some(payload) = next {
        show(app, payload); // show завершает reposition_all
    } else {
        reposition_all(app);
    }
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
#[tauri::command]
pub fn popup_close(window: WebviewWindow) {
    let _ = window.close();
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
    reposition_all(&app);
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
