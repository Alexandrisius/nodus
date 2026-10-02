# Модуль notifications (#100, ADR-0016; приоритеты — ADR-0017)

Живые обновления и уведомления: журнал доставок в БД — источник истины («как
в Телеге»), WS только будит. Приоритеты `urgent | high | medium | low` (UI:
Срочно/Высокий/Средний/Низкий) — абстрактная шкала важности, отвязанная от
смысла события; маппинг kind → priority — декларативная таблица
(`priority-resolver.ts`, ADR-0017). Ознакомление для срочного (СЭД-паттерн
«Е-дело»), повторы срочного BullMQ, анти-свалка (группировка по источнику,
журнал-список низкого, авто-архивация 7 дней, cap 999+).

## Конвейер подключения нового вида уведомлений (ADR-0017)

Любой модуль (задачи, проекты, корреспонденция…) подключает свои события к
центру ровно по этой цепочке — ядро не правится:

1. **Доменное событие** модуля-владельца публикуется через outbox (I9);
   новое имя события — сначала в каталог `docs/architecture/api-conventions.md`.
2. **Хендлер** `events/<событие>.handler.ts` здесь: `static readonly eventType`,
   гейт фичефлага, получатели (read-порт или payload), сборка строк
   `NotificationInsert` через `NotificationsService`, эмит
   `notification.dispatch_requested` в той же транзакции. Идемпотентность —
   дедуп `(event_id, user_id)` в `createFromEvent`.
3. **kind** — новое значение в `notificationKindSchema` (`packages/contracts`).
4. **Строка приоритета** в `KIND_PRIORITY` (`priority-resolver.ts`) + **строка
   i18n** в `kindTitles` (`ru-notifications.ts`). Тип `Record<NotificationKind,
NotificationPriority>` не даст собрать код без строки.

Смена важности существующего события = правка одной строки `KIND_PRIORITY`
(вердикт владельца 02.10: маппинг часто меняется в пилоте).

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

- `notifications` — журнал: seq (bigserial, курсор дельты), priority, kind,
  источник (source_type/source_id + conversation/message ids), preview,
  urgent_text (лист ознакомления), read_at, ack_at, repeats_stopped_at;
  дедуп `(event_id, user_id)`.
- `notification_deliveries` — журнал доставок (канал ws/repeat + попытка).
- `notification_settings` — DND-расписание per user.

## Механика

- **Генерация**: подписчики `chat.message_sent/edited/read/reaction_added`
  (EventDispatcher, дедуп event_deliveries + уникальный индекс). Резолвер —
  чистая функция: автор skip; kind по контексту события; priority из
  декларативной таблицы `KIND_PRIORITY`; mute понижает до `low` (срочное
  пробивает). Snooze/DND/«открытый чат» — подавления клиента (контекст
  вкладки), журнал честен.
- **Доставка**: `notification.dispatch_requested` → outbox → RedisStreamPublisher
  (все доменные события) → gateway → комната `user:{id}`. Хендлер dispatch
  пишет deliveries и для urgent планирует повторы.
- **Повторы срочного**: BullMQ `notification-repeat`, интервал
  `NOTIFY_URGENT_REPEAT_SEC` (300), потолок `NOTIFY_URGENT_MAX_SEC` (1800),
  стоп: ack/прочтение/ответ/реакция. Лимит отправителя
  `NOTIFY_URGENT_DAILY_LIMIT` (3) и потолок группы `NOTIFY_URGENT_GROUP_MAX`
  (20) — в chat при отправке.
- **Уборка**: `notification-retention` cron 04:00 — низкий старше 7 дней
  помечается прочитанным (журнал жив для фильтра «Все»; `?q=` сервера —
  до глобального поиска топбара #172).

## Фичефлаг (I10)

`notifications` (FeatureFlagGuard на контроллере; хендлеры проверяют
сервисом): off → эндпоинты NOT_FOUND, события не журнализируются, чат жив;
фронт Главной деградирует в прежнюю витрину.

## Лимиты

- Страница журнала ≤ 100 (по умолчанию 50), курсор по seq.
- Превью строки ≤ 160 символов; urgent_text — полный текст (лист).
