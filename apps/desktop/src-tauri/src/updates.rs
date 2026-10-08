use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

use crate::portal;

/// Результат запуска обновления для мини-UI (экран «обновите приложение»).
#[derive(Clone, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum UpdateOutcome {
    UpToDate,
    Installing,
    /// Манифест недоступен/не подписан/сеть — обновиться сейчас нельзя.
    Unavailable,
}

/// Проверить и тихо поставить обновление оболочки с сервера портала
/// (`<portal>/desktop/latest.json`, minisign-подпись, ADR-0019). Эндпоинт
/// известен только после подключения — в рантайме через UpdaterBuilder.
pub async fn check_and_install(app: &AppHandle) -> Result<UpdateOutcome, String> {
    let Some(root) = portal::portal_root(app) else {
        return Ok(UpdateOutcome::Unavailable);
    };
    let endpoint =
        tauri::Url::parse(&format!("{root}/desktop/latest.json")).map_err(|e| e.to_string())?;
    let updater = app
        .updater_builder()
        .endpoints(vec![endpoint])
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?;
    let update = match updater.check().await {
        Ok(Some(update)) => update,
        Ok(None) => return Ok(UpdateOutcome::UpToDate),
        Err(e) => {
            log::info!("обновлений нет или эндпоинт недоступен: {e}");
            return Ok(UpdateOutcome::Unavailable);
        }
    };
    log::info!(
        "обновление оболочки: {} → {}",
        update.current_version,
        update.version
    );
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    Ok(UpdateOutcome::Installing)
}

#[tauri::command]
pub async fn run_updater(app: AppHandle) -> Result<UpdateOutcome, String> {
    check_and_install(&app).await
}

/// Тихая проверка после подключения к порталу (фоновая, результат не блокирует).
pub fn spawn_startup_check(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        match check_and_install(&app).await {
            Ok(UpdateOutcome::UpToDate) | Ok(UpdateOutcome::Unavailable) => {}
            Ok(UpdateOutcome::Installing) => log::info!("обновление устанавливается"),
            Err(e) => log::warn!("фоновая проверка обновлений: {e}"),
        }
    });
}
