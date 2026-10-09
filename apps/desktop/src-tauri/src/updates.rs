use serde::Serialize;
use std::sync::Mutex;
use tauri::AppHandle;
use tauri_plugin_updater::Update;
use tauri_plugin_updater::UpdaterExt;

use crate::bridge;
use crate::portal;
use crate::tray_menu;

/// Результат запуска обновления для мини-UI (экран «обновите приложение»).
#[derive(Clone, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum UpdateOutcome {
    UpToDate,
    Installing,
    /// Манифест недоступен/не подписан/сеть — обновиться сейчас нельзя.
    Unavailable,
}

/// Состояние пассивного потока для портала (#263, зеркало contracts
/// `shellUpdateStateSchema`). Idle-ветка не несёт версии.
#[derive(Clone, Serialize)]
pub struct UpdateStatePayload {
    pub status: &'static str,
    pub version: Option<String>,
}

/// Скачанное обновление живёт до решения пользователя: установка — только
/// явно (кнопка в шапке портала / пункт трея), работа не прерывается.
enum Prepared {
    None,
    Downloading { version: String },
    Ready { update: Box<Update>, bytes: Vec<u8> },
}

static PREPARED: Mutex<Prepared> = Mutex::new(Prepared::None);

fn snapshot_state() -> UpdateStatePayload {
    match &*PREPARED.lock().unwrap() {
        Prepared::None => UpdateStatePayload {
            status: "idle",
            version: None,
        },
        Prepared::Downloading { version } => UpdateStatePayload {
            status: "downloading",
            version: Some(version.clone()),
        },
        Prepared::Ready { update, .. } => UpdateStatePayload {
            status: "available",
            version: Some(update.version.clone()),
        },
    }
}

pub fn has_prepared() -> bool {
    matches!(&*PREPARED.lock().unwrap(), Prepared::Ready { .. })
}

/// Версия скачанного обновления (для подписи пункта трея).
pub fn pending_version() -> Option<String> {
    match &*PREPARED.lock().unwrap() {
        Prepared::Ready { update, .. } => Some(update.version.clone()),
        _ => None,
    }
}

fn push_state(app: &AppHandle) {
    bridge::push_to_portal(app, "update-state", &snapshot_state());
}

/// Реакция на готовность портала (shell_ready): события state могли прилететь
/// eval'ом ДО монтирования веб-слушателя и потеряться (push без очереди — та
/// же гонка, что с deep link'ами) — доставить снапшот повторно. Если проверка
/// ещё ничего не нашла — повторить её: портал мог быть подключён раньше, чем
/// новую версию выложили в раздачу (фидбек 09.10: точка требовала Ctrl+Shift+R).
pub fn on_portal_ready(app: &AppHandle) {
    let busy = matches!(
        &*PREPARED.lock().unwrap(),
        Prepared::Downloading { .. } | Prepared::Ready { .. }
    );
    if busy {
        push_state(app);
    } else {
        spawn_startup_check(app.clone());
    }
}

/// Собрать апдейтер с эндпоинтом текущего портала (эндпоинт известен только
/// после подключения — в рантайме через UpdaterBuilder).
fn build_updater(app: &AppHandle) -> Result<tauri_plugin_updater::Updater, String> {
    let Some(root) = portal::portal_root(app) else {
        return Err("portal-not-connected".into());
    };
    let endpoint =
        tauri::Url::parse(&format!("{root}/desktop/latest.json")).map_err(|e| e.to_string())?;
    app.updater_builder()
        .endpoints(vec![endpoint])
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())
}

/// Проверить и тихо скачать обновление (пассивный поток #263): состояние
/// уходит в портал и трей, установка — по решению пользователя. Истина —
/// обновление скачано и ждёт.
pub async fn check_and_prepare(app: &AppHandle) -> Result<bool, String> {
    let updater = match build_updater(app) {
        Ok(updater) => updater,
        Err(e) => {
            log::info!("обновления недоступны: {e}");
            return Ok(false);
        }
    };
    let update = match updater.check().await {
        Ok(Some(update)) => update,
        Ok(None) => {
            let mut state = PREPARED.lock().unwrap();
            if matches!(&*state, Prepared::Ready { .. }) {
                // Готовое обновление не сбрасываем: оно ждёт решения.
                return Ok(true);
            }
            *state = Prepared::None;
            drop(state);
            push_state(app);
            return Ok(false);
        }
        Err(e) => {
            log::info!("обновлений нет или эндпоинт недоступен: {e}");
            return Ok(false);
        }
    };
    let version = update.version.clone();
    log::info!(
        "обновление оболочки: {} → {} (скачивание)",
        update.current_version,
        version
    );
    {
        let mut state = PREPARED.lock().unwrap();
        *state = Prepared::Downloading { version };
    }
    push_state(app);
    match update.download(|_, _| {}, || {}).await {
        Ok(bytes) => {
            *PREPARED.lock().unwrap() = Prepared::Ready {
                update: Box::new(update),
                bytes,
            };
            push_state(app);
            tray_menu::mark_update_ready(app);
            Ok(true)
        }
        Err(e) => {
            log::warn!("скачивание обновления не удалось: {e}");
            *PREPARED.lock().unwrap() = Prepared::None;
            push_state(app);
            Err(e.to_string())
        }
    }
}

/// Установить скачанное обновление: passive-установщик завершает процесс и
/// возвращает приложение (NSIS `/R`, restart_after_install плагина). Ошибка
/// установки теряет скачанные байты — следующая проверка скачает заново.
pub fn apply_prepared() -> Result<(), String> {
    let taken = std::mem::replace(&mut *PREPARED.lock().unwrap(), Prepared::None);
    let Prepared::Ready { update, bytes } = taken else {
        *PREPARED.lock().unwrap() = taken;
        return Err("update-not-ready".into());
    };
    log::info!(
        "установка обновления {} (passive, перезапуск)",
        update.version
    );
    update.install(bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_update_state() -> UpdateStatePayload {
    snapshot_state()
}

#[tauri::command]
pub fn apply_update() -> Result<(), String> {
    apply_prepared()
}

/// Проверить и СРАЗУ поставить обновление (безусловный путь): экран
/// «обновите приложение» при оболочке ниже NODUS_MIN_SHELL_VERSION.
pub async fn check_and_install(app: &AppHandle) -> Result<UpdateOutcome, String> {
    let updater = build_updater(app)?;
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

/// Тихая проверка после подключения к порталу (фоновая, результат не
/// блокирует вход): скачивает и ЖДЁТ решения пользователя (#263).
pub fn spawn_startup_check(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        match check_and_prepare(&app).await {
            Ok(true) => log::info!("обновление скачано — ждёт решения пользователя"),
            Ok(false) => {}
            Err(e) => log::warn!("фоновая проверка обновлений: {e}"),
        }
    });
}
