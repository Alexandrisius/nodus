use serde::Deserialize;
use serde::Serialize;
use tauri::ipc::CapabilityBuilder;
use tauri::{AppHandle, Manager, UserAttentionType};
use tauri_plugin_opener::OpenerExt;

use crate::badge;
use crate::popups;
use crate::portal;

/// JS-мост, инъектируемый в webview до скриптов каждой страницы (включая
/// удалённый портал). Прямое направление «веб → оболочка» — команды через
/// штатный IPC (`__TAURI_INTERNALS__.invoke`), разграниченные runtime-
/// capability ровно по origin'у портала; обратное — `__nodusDesktopInvoke`
/// из Rust (`eval`). Токены и креды мост не переносит (ADR-0019).
pub fn initialization_script(shell_version: &str) -> String {
    format!(
        r#"(function () {{
  if (window.__nodusDesktopBridge) return;
  var VERSION = {version};
  var listeners = {{}};
  function invoke(cmd, args) {{
    var i = window.__TAURI_INTERNALS__;
    if (!i || typeof i.invoke !== 'function') {{
      return Promise.reject(new Error('shell-ipc-unavailable'));
    }}
    return i.invoke(cmd, args);
  }}
  window.__nodusDesktopInvoke = function (type, payload) {{
    var fns = listeners[type] || [];
    for (var k = 0; k < fns.length; k++) {{
      try {{ fns[k](payload); }} catch (e) {{ console.error('[nodus-desktop]', e); }}
    }}
    return fns.length > 0;
  }};
  window.nodusDesktop = {{
    shellVersion: VERSION,
    platform: 'windows',
    showPopup: function (p) {{ return invoke('notify_popup', {{ payload: p }}); }},
    setUnreadBadge: function (count) {{ return invoke('set_unread_badge', {{ count: count }}); }},
    flashTaskbar: function (critical) {{ return invoke('flash_taskbar', {{ critical: !!critical }}); }},
    openExternal: function (url) {{ return invoke('open_external', {{ url: url }}); }},
    dismissPopups: function (conversationId) {{ return invoke('dismiss_popups', {{ conversationId: conversationId }}); }},
    getShellInfo: function () {{ return invoke('get_shell_info'); }},
    shellReady: function () {{ return invoke('shell_ready'); }},
    onEvent: function (type, fn) {{
      (listeners[type] = listeners[type] || []).push(fn);
      return function () {{
        var arr = listeners[type] || [];
        var i = arr.indexOf(fn);
        if (i >= 0) arr.splice(i, 1);
      }};
    }}
  }};
  Object.defineProperty(window, '__nodusDesktopBridge', {{ value: true }});
}})();"#,
        version = serde_json::to_string(shell_version).unwrap_or_else(|_| "\"0.0.0\"".into())
    )
}

/// Выдать origin'у портала минимальный набор прав моста (dynamic-acl).
/// Паттерн `{origin}/*` покрывает все пути портала; окно — только main.
pub fn grant_portal_capability(app: &AppHandle, root: &str) -> tauri::Result<()> {
    let capability = CapabilityBuilder::new("portal-bridge")
        .local(false)
        .window("main")
        .remote(format!("{root}/*"))
        .permission("allow-notify-popup")
        .permission("allow-set-unread-badge")
        .permission("allow-flash-taskbar")
        .permission("allow-open-external")
        .permission("allow-dismiss-popups")
        .permission("allow-get-shell-info")
        .permission("allow-shell-ready");
    app.add_capability(capability)
}

/// Пуш события «оболочка → веб» (eval в главное окно). JSON-строки — валидные
/// JS-литералы, экранирование бесплатно.
pub fn push_to_portal(app: &AppHandle, event_type: &str, payload: &impl Serialize) {
    let Some(win) = app.get_webview_window("main") else {
        return;
    };
    let js = format!(
        "window.__nodusDesktopInvoke && window.__nodusDesktopInvoke({}, {})",
        serde_json::to_string(event_type).unwrap_or_default(),
        serde_json::to_string(payload).unwrap_or_else(|_| "null".into()),
    );
    if let Err(e) = win.eval(js.as_str()) {
        log::warn!("доставка события {event_type} не удалась: {e}");
    }
}

/// Строгая проверка UUID без зависимости: 8-4-4-4-12 hex (зеркалит
/// z.string().uuid() контракта — Rust-сторона валидирует границу сама).
pub fn is_valid_conversation(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 36
        && b.iter().enumerate().all(|(i, c)| match i {
            8 | 13 | 18 | 23 => *c == b'-',
            _ => c.is_ascii_hexdigit(),
        })
}

/// Зеркало contracts `popupPayloadSchema` (desktop-bridge.schema.ts).
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PopupPayload {
    pub id: String,
    pub conversation_id: String,
    pub title: String,
    pub avatar_url: Option<String>,
    pub preview: String,
    /// Превью — метка вложения («Фотография»): попап красит акцентом.
    pub preview_attachment: Option<bool>,
    pub urgent: bool,
    pub can_reply: bool,
}

/// Зеркало contracts `popupReplyEventSchema`.
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PopupReply {
    pub id: String,
    pub conversation_id: String,
    pub text: String,
}

/// Async обязателен: на Windows создание WebviewWindow из синхронной
/// команды/обработчика ДЕДЛОКИТ WebView2 — окно висит на about:blank
/// (known issue, docs.rs WebviewWindowBuilder; баги tauri #13963/#13092).
#[tauri::command]
pub async fn notify_popup(app: AppHandle, payload: PopupPayload) -> Result<(), String> {
    // Граница контракта на Rust-стороне (security-аудит #254, подозрение 5).
    if payload.id.is_empty()
        || payload.id.len() > 200
        || !is_valid_conversation(&payload.conversation_id)
        || payload.title.is_empty()
        || payload.title.chars().count() > 200
        || payload.preview.chars().count() > 500
        || payload
            .avatar_url
            .as_deref()
            .is_some_and(|u| u.len() > 2000)
    {
        return Err("invalid_payload".into());
    }
    popups::show(&app, payload);
    Ok(())
}

#[tauri::command]
pub fn set_unread_badge(app: AppHandle, count: Option<u32>) {
    badge::apply(&app, count);
}

/// Погасить попапы беседы: портал зовёт при открытии беседы (модель
/// Telegram — открыл чат, его уведомления не висят устаревшими). Только
/// закрывает окна/вычищает очередь, ничего не создаёт — sync безопасен.
#[tauri::command]
pub fn dismiss_popups(app: AppHandle, conversation_id: String) -> Result<(), String> {
    if !is_valid_conversation(&conversation_id) {
        return Err("invalid_payload".into());
    }
    popups::dismiss_for_conversation(&app, &conversation_id);
    Ok(())
}

#[tauri::command]
pub fn flash_taskbar(app: AppHandle, critical: bool) {
    if let Some(win) = app.get_webview_window("main") {
        let attention = if critical {
            UserAttentionType::Critical
        } else {
            UserAttentionType::Informational
        };
        if let Err(e) = win.request_user_attention(Some(attention)) {
            log::warn!("мигание таскбара не удалось: {e}");
        }
    }
}

/// Открыть ссылку в системном браузере: только http/https (deep link'и портала
/// и внешние адреса; произвольные схемы и file:// запрещены).
#[tauri::command]
pub fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    let parsed = tauri::Url::parse(&url).map_err(|_| "invalid_url")?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("invalid_url".into());
    }
    app.opener()
        .open_url(parsed.to_string(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellInfo {
    pub version: String,
    pub platform: String,
}

#[tauri::command]
pub fn get_shell_info(app: AppHandle) -> ShellInfo {
    ShellInfo {
        version: app.package_info().version.to_string(),
        platform: std::env::consts::OS.into(),
    }
}

/// Веб-приложение армировало слушателей моста: доставить отложенный deep link.
#[tauri::command]
pub fn shell_ready(app: AppHandle) {
    if let Some(link) = portal::take_pending_deep_link(&app) {
        route_deep_link(&app, &link);
    }
}

/// Разбор `nodus://chat/<uuid>` и доставка в веб (или очередь до готовности).
pub fn route_deep_link(app: &AppHandle, raw: &str) {
    let Ok(url) = tauri::Url::parse(raw) else {
        log::warn!("некорректный deep link: {raw}");
        return;
    };
    if url.scheme() != "nodus" {
        return;
    }
    let conversation_id = match url.host_str() {
        Some("chat") => url.path().trim_start_matches('/').to_string(),
        _ => {
            log::info!("deep link без обработчика: {raw}");
            return;
        }
    };
    if conversation_id.is_empty() {
        return;
    }
    if !portal::is_ready(app) {
        portal::set_pending_deep_link(app, raw.to_string());
        crate::show_main(app);
        return;
    }
    crate::show_main(app);
    push_to_portal(
        app,
        "open-conversation",
        &serde_json::json!({ "conversationId": conversation_id }),
    );
}
