use std::collections::VecDeque;
use std::sync::Mutex;

use tauri::webview::WebviewWindowBuilder;
use tauri::{AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindow};

use crate::bridge::{self, PopupPayload, PopupReply};

/// Геометрия попапа (логические px): компактная карточка ~360×104, с полем
/// ответа ~360×118 (одна строка ввода, кнопка-гексагон внутри поля — канон
/// композера; окно прозрачное — скругления несёт карточка).
const POPUP_W: f64 = 360.0;
const POPUP_H: f64 = 104.0;
const POPUP_H_REPLY: f64 = 118.0;
const MARGIN: f64 = 14.0;
const GAP: f64 = 8.0;
/// Максимум на экране (право-низ, рост вверх); сверх — очередь (Telegram).
const MAX_STACK: u32 = 4;

struct ActivePopup {
    label: String,
    slot: u32,
    conversation_id: String,
    /// Payload для pull-модели: окно забирает данные само после загрузки
    /// (push-событие проигрывал бы гонку со скоростью монтирования React).
    payload: serde_json::Value,
}

/// Стек попапов: слоты 0..4 от право-низа вверх + очередь переполнения.
/// Автоскрытия НЕТ (вердикт владельца 08.10): попапы накапливаются и живут
/// до реакции пользователя — «после обеда увидел, кто писал» (модель
/// Telegram: закрыл один — выехал следующий из очереди; счётчик — в трее).
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
}

fn stack(app: &AppHandle) -> std::sync::MutexGuard<'_, PopupStack> {
    app.state::<Mutex<PopupStack>>().inner().lock().unwrap()
}

/// Показать попап. Вызывать ТОЛЬКО из async-команд: на Windows билдер окна
/// в синхронном контексте дедлокит WebView2 (см. bridge::notify_popup).
/// Экран полон — уведомление встаёт в очередь, докатывается по мере
/// закрытия активных (on_popup_destroyed).
pub fn show(app: &AppHandle, payload: PopupPayload) {
    let payload_json = serde_json::json!({
        "id": payload.id,
        "conversationId": payload.conversation_id,
        "title": payload.title,
        "avatarUrl": payload.avatar_url,
        "preview": payload.preview,
        "urgent": payload.urgent,
        "canReply": payload.can_reply,
    });
    let (label, slot) = {
        let mut s = stack(app);
        let Some(slot) = s.free_slot() else {
            s.pending.push_back(payload);
            log::info!("экран полон — попап в очереди (всего в очереди: {})", s.pending.len());
            return;
        };
        s.counter += 1;
        let label = format!("popup-{}", s.counter);
        s.active.push(ActivePopup {
            label: label.clone(),
            slot,
            conversation_id: payload.conversation_id,
            payload: payload_json,
        });
        (label, slot)
    };

    // Роут попапа — по label (main.tsx рендерит PopupView для popup-*).
    let win = match WebviewWindowBuilder::new(app, &label, WebviewUrl::App("index.html".into()))
        .title("Nodus")
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .inner_size(POPUP_W, POPUP_H)
        .visible(false)
        // Прозрачное окно: скруглённые углы и тень рисует карточка (CSS);
        // непрозрачный фон окна вылезал артефактами из-за скруглений,
        // а системная тень тянулась бы по прямоугольнику окна.
        .transparent(true)
        .shadow(false)
        .build()
    {
        Ok(win) => win,
        Err(e) => {
            log::error!("попап не создан: {e}");
            stack(app).active.retain(|p| p.label != label);
            return;
        }
    };

    // Право-низ work_area монитора курсора (физические px, DPI-точно);
    // монитор недоступен — остаёмся в позиции билдера (центр).
    if let Some((x, y)) = position_for_slot(app, slot, POPUP_H) {
        let _ = win.set_position(PhysicalPosition::new(x, y));
    }
    let _ = win.show();
}

/// Слот k → право-низ work_area монитора курсора (физические координаты:
/// work_area физический, размеры окна конвертируются через scale_factor).
/// Низ слота фиксирован: рост высоты (поле ответа) поднимает ВЕРХ окна,
/// карточка не уезжает за низ экрана (канон Telegram onReplyResize).
fn position_for_slot(app: &AppHandle, slot: u32, height: f64) -> Option<(i32, i32)> {
    let cursor = app.cursor_position().ok()?;
    let monitor = app.monitor_from_point(cursor.x, cursor.y).ok()??;
    let scale = monitor.scale_factor();
    let wa = monitor.work_area();
    let popup_w = (POPUP_W * scale).round() as i32;
    let popup_h = (height * scale).round() as i32;
    let margin = (MARGIN * scale).round() as i32;
    let gap = (GAP * scale).round() as i32;
    let x = wa.position.x + wa.size.width as i32 - popup_w - margin;
    let y = wa.position.y + wa.size.height as i32 - margin
        - slot as i32 * ((POPUP_H * scale).round() as i32 + gap)
        - popup_h;
    Some((x, y))
}

pub fn on_popup_destroyed(app: &AppHandle, label: &str) {
    // Докат очереди — ПОСЛЕ снятия лока: show() лочит стек сам.
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
        show(app, payload);
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

/// Payload попапа — pull-моделью после загрузки окна (без гонки со маунтом).
#[tauri::command]
pub fn popup_get_data(app: AppHandle, window: WebviewWindow) -> Option<serde_json::Value> {
    let label = window.label();
    stack(&app).active.iter().find(|p| p.label == label).map(|p| p.payload.clone())
}

/// Закрыть попап — вызывает само окно (крестик/Esc/после действия).
#[tauri::command]
pub fn popup_close(window: WebviewWindow) {
    let _ = window.close();
}

/// Высота окна под режим ответа: низ слота фиксирован, растёт ВЕРХ —
/// иначе поле уводило карточку за низ экрана (фидбек владельца 08.10).
#[tauri::command]
pub fn popup_set_expanded(app: AppHandle, window: WebviewWindow, expanded: bool) {
    use tauri::LogicalSize;
    let slot = stack(&app)
        .active
        .iter()
        .find(|p| p.label == window.label())
        .map(|p| p.slot);
    let h = if expanded { POPUP_H_REPLY } else { POPUP_H };
    let _ = window.set_size(tauri::Size::Logical(LogicalSize::new(POPUP_W, h)));
    if let Some(slot) = slot {
        if let Some((x, y)) = position_for_slot(&app, slot, h) {
            let _ = window.set_position(PhysicalPosition::new(x, y));
        }
    }
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
                conversation_id: format!("conv-{k}"),
                payload: serde_json::Value::Null,
            });
        }
    }

    #[test]
    fn overflow_уходит_в_очередь_и_докатывается() {
        let mut s = PopupStack::default();
        occupy(&mut s, MAX_STACK);
        assert!(s.free_slot().is_none(), "экран полон");
        s.pending.push_back(payload("m5", "conv-x"));
        // Закрыли один попап — очередь отдаёт голову.
        s.active.remove(0);
        assert!(s.free_slot().is_some());
        assert_eq!(s.pending.pop_front().map(|p| p.id), Some("m5".into()));
        assert!(s.pending.pop_front().is_none());
    }

    #[test]
    fn dismiss_вычищает_очередь_только_своей_беседы() {
        let mut s = PopupStack::default();
        s.pending.push_back(payload("m1", "conv-1"));
        s.pending.push_back(payload("m2", "conv-2"));
        s.pending.push_back(payload("m3", "conv-1"));
        s.pending.retain(|p| p.conversation_id != "conv-1");
        let rest: Vec<&str> = s.pending.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(rest, vec!["m2"]);
    }
}
