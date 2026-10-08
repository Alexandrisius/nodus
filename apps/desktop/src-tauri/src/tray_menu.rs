use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};
use tauri_plugin_autostart::ManagerExt as _;

use crate::updates;

/// Трей: «Открыть Nodus», «Запускать при входе в Windows» (чекбокс),
/// «Проверить обновления», «Сменить сервер…», «Выход». ЛКМ по значку —
/// показать окно; закрытие окна всегда прячет в трей (lib.rs).
pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Открыть Nodus", true, None::<&str>)?;
    let autostart_enabled = app.autolaunch().is_enabled().unwrap_or(false);
    let autostart =
        CheckMenuItem::with_id(app, "autostart", "Запускать при входе в Windows", true, autostart_enabled, None::<&str>)?;
    let update = MenuItem::with_id(app, "update", "Проверить обновления", true, None::<&str>)?;
    let reload = MenuItem::with_id(app, "reload", "Перезагрузить портал", true, None::<&str>)?;
    let change = MenuItem::with_id(app, "change_server", "Сменить сервер…", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Выход", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &autostart, &update, &reload, &change, &quit])?;

    let icon = crate::badge::themed_base_icon(app);
    TrayIconBuilder::with_id("nodus-tray")
        .icon(icon)
        .tooltip("Nodus")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => crate::show_main(app),
            "autostart" => toggle_autostart(app),
            "update" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = updates::check_and_install(&app).await {
                        log::warn!("проверка обновлений не удалась: {e}");
                    }
                });
            }
            "reload" => {
                // Recovery (ADR-0019 Ф4): краш рендера лечится перезагрузкой
                // webview — сессия портала переживает reload (refresh-cookie).
                if let Some(win) = app.get_webview_window("main") {
                    if let Err(e) = win.eval("location.reload()") {
                        log::warn!("перезагрузка портала не удалась: {e}");
                    }
                }
            }
            "change_server" => crate::portal::change_server(app.clone()),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event
            {
                crate::show_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

fn toggle_autostart(app: &AppHandle) {
    let autolaunch = app.autolaunch();
    let result = if autolaunch.is_enabled().unwrap_or(false) {
        autolaunch.disable()
    } else {
        autolaunch.enable()
    };
    if let Err(e) = result {
        log::warn!("переключение автозапуска не удался: {e}");
    }
}

/// Бейдж непрочитанных: смена иконки трея (badge.rs рисует).
pub fn set_tray_icon(app: &AppHandle, icon: Image<'_>) {
    if let Some(tray) = app.tray_by_id("nodus-tray") {
        if let Err(e) = tray.set_icon(Some(icon)) {
            log::warn!("иконка трея не обновлена: {e}");
        }
    }
}

pub fn set_tray_tooltip(app: &AppHandle, tooltip: &str) {
    if let Some(tray) = app.tray_by_id("nodus-tray") {
        let _ = tray.set_tooltip(Some(tooltip));
    }
}
