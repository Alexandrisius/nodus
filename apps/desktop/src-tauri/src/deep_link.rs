use tauri::AppHandle;
use tauri_plugin_deep_link::DeepLinkExt;

/// Схема `nodus://` (плагин deep-link): холодный старт + регистрация схемы
/// в реестре (ремень+подтяжки для portable/dev-запусков; установщик тоже
/// регистрирует). Разбор и доставка — bridge::route_deep_link.
pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    if let Err(e) = app.deep_link().register("nodus") {
        log::warn!("схема nodus:// не зарегистрирована: {e}");
    }
    if let Ok(Some(urls)) = app.deep_link().get_current() {
        for url in urls {
            crate::bridge::route_deep_link(app, url.as_str());
        }
    }
    Ok(())
}
