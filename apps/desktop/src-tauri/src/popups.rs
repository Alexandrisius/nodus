use std::sync::Mutex;

use tauri::webview::WebviewWindowBuilder;
use tauri::{AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindow};

use crate::bridge::{self, PopupPayload, PopupReply};

/// Геометрия попапа (логические px): карточка 360×136, с полем ответа 360×216
/// (референс Telegram; окно прозрачное — скругления несёт сама карточка).
const POPUP_W: f64 = 360.0;
const POPUP_H: f64 = 136.0;
const POPUP_H_REPLY: f64 = 216.0;
const MARGIN: f64 = 14.0;
const GAP: f64 = 10.0;
/// Максимум в стеке (право-низ, рост вверх) — как Telegram.
const MAX_STACK: u32 = 4;
/// Автоскрытие обычного попапа; важные (urgent) висят до реакции.
const AUTOCLOSE_MS: u64 = 6000;

struct ActivePopup {
    label: String,
    slot: u32,
    held: bool,
    urgent: bool,
    created: std::time::Instant,
    /// Payload для pull-модели: окно забирает данные само после загрузки
    /// (push-событие проигрывал бы гонку со скоростью монтирования React).
    payload: serde_json::Value,
}

/// Стек активных попапов: слоты 0..4 от право-низа вверх.
#[derive(Default)]
pub struct PopupStack {
    counter: u64,
    active: Vec<ActivePopup>,
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
        "urgent": payload.urgent,
        "canReply": payload.can_reply,
    });
    let label = {
        let mut s = stack(app);
        // Стек полон: закрываем старейший неважный (важные/активные не трогаем);
        // слот освободится событием Destroyed и будет перезанят ниже.
        if s.active.len() >= MAX_STACK as usize {
            let victim = s
                .active
                .iter()
                .filter(|p| !p.urgent && !p.held)
                .min_by_key(|p| p.created)
                .map(|p| p.label.clone());
            if let Some(v) = victim {
                if let Some(w) = app.get_webview_window(&v) {
                    let _ = w.close();
                }
            }
        }
        let used: Vec<u32> = s.active.iter().map(|p| p.slot).collect();
        let Some(slot) = (0..MAX_STACK).find(|k| !used.contains(k)) else {
            log::info!("стек попапов занят важными — попап пропущен ({})", payload.id);
            return;
        };
        s.counter += 1;
        let label = format!("popup-{}", s.counter);
        s.active.push(ActivePopup {
            label: label.clone(),
            slot,
            held: false,
            urgent: payload.urgent,
            created: std::time::Instant::now(),
            payload: payload_json,
        });
        label
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
    let slot = stack(app).active.iter().find(|p| p.label == label).map(|p| p.slot).unwrap_or(0);
    if let Some((x, y)) = position_for_slot(app, slot) {
        let _ = win.set_position(PhysicalPosition::new(x, y));
    }
    let _ = win.show();
    let _ = win.set_focus();

    if !payload.urgent {
        let app = app.clone();
        let label = label.clone();
        tauri::async_runtime::spawn_blocking(move || {
            std::thread::sleep(std::time::Duration::from_millis(AUTOCLOSE_MS));
            let held = stack(&app).active.iter().any(|p| p.label == label && p.held);
            if !held {
                if let Some(w) = app.get_webview_window(&label) {
                    let _ = w.close();
                }
            }
        });
    }
}

/// Слот k → право-низ work_area монитора курсора (физические координаты:
/// work_area физический, размеры окна конвертируются через scale_factor).
fn position_for_slot(app: &AppHandle, slot: u32) -> Option<(i32, i32)> {
    let cursor = app.cursor_position().ok()?;
    let monitor = app.monitor_from_point(cursor.x, cursor.y).ok()??;
    let scale = monitor.scale_factor();
    let wa = monitor.work_area();
    let popup_w = (POPUP_W * scale).round() as i32;
    let popup_h = (POPUP_H * scale).round() as i32;
    let margin = (MARGIN * scale).round() as i32;
    let gap = (GAP * scale).round() as i32;
    let x = wa.position.x + wa.size.width as i32 - popup_w - margin;
    let y = wa.position.y + wa.size.height as i32 - popup_h - margin - slot as i32 * (popup_h + gap);
    Some((x, y))
}

pub fn on_popup_destroyed(app: &AppHandle, label: &str) {
    stack(app).active.retain(|p| p.label != label);
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

/// Пользователь начал ответ — снять автоскрытие.
#[tauri::command]
pub fn popup_hold(app: AppHandle, window: WebviewWindow) {
    let label = window.label().to_string();
    if let Some(p) = stack(&app).active.iter_mut().find(|p| p.label == label) {
        p.held = true;
    }
}

/// Высота окна под режим ответа (логические px).
#[tauri::command]
pub fn popup_set_expanded(window: WebviewWindow, expanded: bool) {
    use tauri::LogicalSize;
    let h = if expanded { POPUP_H_REPLY } else { POPUP_H };
    let _ = window.set_size(tauri::Size::Logical(LogicalSize::new(POPUP_W, h)));
}

#[tauri::command]
pub fn popup_submit_reply(app: AppHandle, window: WebviewWindow, payload: PopupReply) {
    bridge::push_to_portal(&app, "popup-reply", &payload);
    let _ = window.close();
}

#[tauri::command]
pub fn popup_open(app: AppHandle, window: WebviewWindow, conversation_id: String) {
    crate::show_main(&app);
    bridge::push_to_portal(
        &app,
        "open-conversation",
        &serde_json::json!({ "conversationId": conversation_id }),
    );
    let _ = window.close();
}
