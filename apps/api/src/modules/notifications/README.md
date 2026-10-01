# Модуль notifications (#100, ADR-0016)

Живые обновления и уведомления: журнал доставок в БД — источник истины («как
в Телеге»), WS только будит. Ярусы `urgent | personal | action | background`
(иерархия блоков Главной = иерархия ярусов), ознакомление для срочного
(СЭД-паттерн «Е-дело»), повторы срочного BullMQ, анти-свалка (группировка по
источнику, авто-архивация фона 7 дней, cap 999+).

## Контракты

- `@nodus/contracts/notifications/`: `notificationSchema` (строка журнала),
  `notificationSummarySchema` (число+точка), `listNotificationsQuerySchema`
  (фильтры пилюль + q + afterSeq-дельта), `urgentAckStatusSchema`
  («Ознакомились N из M»), `notificationSettingsSchema` (DND).
- События: `notification.dispatch_requested` (создание/повтор; snapshot для
  тоста), `notification.read` (гашение — синхронизация вкладок D2),
  `notification.acked` (будило отправителю, C9).
- Коды ошибок: `CHAT_URGENT_LIMIT_EXCEEDED`, `CHAT_URGENT_GROUP_TOO_LARGE`
  (проверяются в chat при отправке, I8).

## Таблицы

- `notifications` — журнал: seq (bigserial, курсор дельты), tier, kind,
  источник (source_type/source_id + conversation/message ids), preview,
  urgent_text (лист ознакомления), read_at, ack_at, repeats_stopped_at;
  дедуп `(event_id, user_id)`.
- `notification_deliveries` — журнал доставок (канал ws/repeat + попытка).
- `notification_settings` — DND-расписание per user.

## Механика

- **Генерация**: подписчики `chat.message_sent/read/reaction_added`
  (EventDispatcher, дедуп event_deliveries + уникальный индекс). Ярусный
  резолвер — чистая таблица решений (`tier-resolver.ts`, каждый ряд в
  unit-тесте): автор skip; urgent всем (mute не понижает); direct/mention/
  thread-follow → personal (muted → background); прочее → фон. Snooze/DND/
  «открытый чат» — подавления клиента (контекст вкладки), журнал честен.
- **Доставка**: `notification.dispatch_requested` → outbox → RedisStreamPublisher
  (все доменные события) → gateway → комната `user:{id}`. Хендлер dispatch
  пишет deliveries и для urgent планирует повторы.
- **Повторы срочного**: BullMQ `notification-repeat`, интервал
  `NOTIFY_URGENT_REPEAT_SEC` (300), потолок `NOTIFY_URGENT_MAX_SEC` (1800),
  стоп: ack/прочтение/ответ/реакция. Лимит отправителя
  `NOTIFY_URGENT_DAILY_LIMIT` (3) и потолок группы `NOTIFY_URGENT_GROUP_MAX`
  (20) — в chat при отправке.
- **Уборка**: `notification-retention` cron 04:00 — фон старше 7 дней
  помечается прочитанным (журнал жив для «Все»/поиска).

## Фичефлаг (I10)

`notifications` (FeatureFlagGuard на контроллере; хендлеры проверяют
сервисом): off → эндпоинты NOT_FOUND, события не журнализируются, чат жив;
фронт Главной деградирует в прежнюю витрину.

## Лимиты

- Страница журнала ≤ 100 (по умолчанию 50), курсор по seq.
- Превью строки ≤ 160 символов; urgent_text — полный текст (лист).
