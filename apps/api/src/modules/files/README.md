# Модуль files (M9 фаза 1, #57 — ADR-0013)

Объектное S3-хранилище **SILO** (поддерживаемый форк MinIO от Pigsty,
`silo.pigsty.io`, образ `pgsty/silo`; upstream MinIO архивирован — ADR-0013)

- метаданные `file_objects`/`file_versions`. Первый потребитель — chat
  (вложения сообщений); дальше — correspondence (вложения писем), стикеры,
  аватарки.

## Границы (I3/I13)

- Наружу — только порт **`FILE_STORAGE`** (`core/ports/file-storage.port.ts`):
  `save(meta, stream) → {fileId}` и `remove(fileIds)`. Модуль `@Global`
  (как CryptoModule): потребитель инжектит токен без межмодульного импорта.
- `file_objects`/`file_versions` — только через `FilesRepository`.
- `message_attachments` принадлежит chat (`file_id` — plain UUID, без FK).

## Механика

- **Загрузка** (потребитель вызывает порт): стрим → `putObject` в бакет
  `nodus-files` (ключ `files/{fileId}`), счётчик байт сверяется с заявленным
  `size` — расхождение = `FILE_SIZE_MISMATCH`, объект удаляется. Затем
  `file_objects` + `file_versions` (v1) в БД. Потолок хранилища — 200 МБ
  (`STORAGE_MAX_FILE_BYTES` + лимит busboy в main.ts).- **Отдача**: `GET /api/v1/files/:id/content?exp&sig` — `@Public`, HMAC-подпись
  (`SignedUrlService`, `STORAGE_URL_SECRET`, TTL 24 ч, константное сравнение);
  URL выпускает потребитель в DTO (`fileContentUrl(fileId)`). ETag
  `{id}-v1` → 304; Content-Disposition inline (image/*) / attachment;
  `scan_status=infected` → 410 `FILE_QUARANTINED` (сканер — фаза 2/M14,
  до него pending отдаётся).
- **Учётка**: `minio-init` (compose) создаёт бакет и сервисного пользователя
  `nodus-api` с политикой только на объекты (клиент форка — `mcli`,
  mc-совместимый); root-креды api не получает.
- **Уборка**: брошенные загрузки (неотправленные >48 ч) снимает потребитель
  (chat — при следующей загрузке владельца); объект-сирота при сбое БД после
  put — редок, уборка фазы 2.

## Env (`env.schema`, fail-fast)

`STORAGE_ENDPOINT` (дефолт 127.0.0.1; в docker — `nodus_minio`),
`STORAGE_PORT` (9000), `STORAGE_USE_SSL`, `STORAGE_BUCKET` (nodus-files),
`STORAGE_ACCESS_KEY`/`STORAGE_SECRET_KEY` (сервисная учётка),
`STORAGE_URL_SECRET` (≥32, ≠ JWT_SECRET), `STORAGE_URL_TTL_SECONDS` (86400).

## События и аудит

Своих доменных событий нет (жизненный цикл файла — деталь потребителя; событие
chat `message_sent` уже несёт вложения). Аудит действий — на эндпоинтах
потребителя (`chat.attachment_upload`/`chat.attachment_cancel`).

## Тесты

- Интеграционный `chat-attachments.integration.test.ts` (upload→download на
  живом S3 SILO) — приёмка #57; скипается без `STORAGE_ACCESS_KEY`.
- Unit: `attachments.service.test.ts` (лимиты/kind/отмена/GC),
  `signed-url.service.test.ts` (подпись/TTL/чужой ресурс).
