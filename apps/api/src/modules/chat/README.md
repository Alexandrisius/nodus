# Модуль chat (M6, #58)

Беседы (direct/group/project_channel/task/letter), сообщения, треды, реакции,
закрепы, прочитанность, пересылка. REST-контур под готовый контракт UI
(`packages/contracts/src/chat/chat.schemas.ts`). Realtime — WS-gateway (#104,
M13): события `chat.*` публикуются в Redis Stream `nodus:chat:events`
издателем `core/events/redis-stream-publisher` (опрос outbox по монотонному
`events.seq` ~100 мс); клиент применяет их только как инвалидации. Модуль за
фичефлагом `chat` (I10).

## Ключевые решения (почему так)

- **Порядок `seq` per-conversation**: значение выделяет `UPDATE conversations
SET last_seq = last_seq + n RETURNING` в транзакции отправки — лок строки
  сериализует вставки беседы, порядок seq == порядок коммита. Глобальный
  bigserial так не может: значение выдаётся до коммита, и курсорная выдача
  «всё после N» теряет поздно-коммитящиеся строки с меньшим seq (PostgreSQL
  docs: sequences non-transactional; подтверждено исследованием #58). Гэпы
  возможны (откат транзакции) — курсору достаточно монотонности.
- **Идемпотентность отправки — двойная**: Redis-интерсептор (ADR-0005) +
  `UNIQUE (author_id, client_message_id)` в БД; `client_message_id` = значение
  заголовка `Idempotency-Key` (api-client ставит uuid на каждый POST),
  у копий пересылки — суффикс `:c`/`:i`. Crash-окно между реплеем и фиксацией
  закрывает БД (ON CONFLICT DO NOTHING → SELECT существующей).
- **Прочитанность — watermark**: `conversation_members.last_read_seq` (GREATEST,
  не откатывается) + `last_read_at`. Unread = COUNT(seq > last_read_seq OR
  edited_at > last_read_at) по индексу `(conversation_id, seq)` — без
  денормализованных счётчиков (на 200–300 сотрудников watermark каноничен,
  счётчики дают дрейф). Read-эндпоинта НЕТ: курсор продвигает выдача ленты
  (`GET messages`) — мок-модель, WS уточнит.
- **Удаление — всегда tombstone-строка**: «бесследно» (никто не прочитал) =
  `obliterated=true` → исключается из всех выдач, но строка/seq остаются
  (непрерывность курсоров, ссылки тредов/цитат/пинов, аудит). «Надгробие»
  (хоть один прочитал по курсорам) — виден как «Сообщение удалено». Оба:
  авто-unpin + `deleted:true` в замороженных цитатах ответов.
- **Цитата-ответ — замороженный снапшот** (`reply_snapshot` JSONB: authorId,
  text≤160, quoteText≤160, attachmentKind): правка оригинала не меняет цитату
  (вердикт 24.09), удаление — помечает deleted (сильнее заморозки). Оригинал
  для снапшота ищется ТОЛЬКО в своей беседе (иначе утечка чужого текста).
- **Права — роли + матрица** (`conversations.permissions` JSONB, дефолты в
  contracts): `post` ограждает только корневые сообщения ленты; ответы в
  тредах открыты всем участникам (модель канала новостей: постят избранные,
  обсуждают все). Проверки в сервисах (членство/роль — данные, не request-
  scope), нечлен → 404 (не раскрываем существование).
- **Профили участников** — read-порт `USER_PROFILE_READER` (ADR-0012): таблица
  users из чата не читается (I3/I6).
- **Канал новостей компании** — type=project_channel без привязки к проекту
  (подзаголовок «Канал»), `post=admin`, все сотрудники — участники (вердикт
  владельца 24.09.2026: новости — канал; в каналах публикация по правам, в
  группах пишут все; обсуждение в тредах открыто всем).

## Эндпоинты (`/api/v1/chat`, все за Bearer + флагом `chat`)

| Маршрут                                                             | Назначение                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /conversations`                                                | Список бесед юзера: `?cursor=&limit=&search=`; keyset `(last_message_at DESC NULLS LAST, id)`; LATERAL lastMessage+unread одним запросом                                                                                                                       |
| `POST /conversations`                                               | Группа/канал: создатель owner, memberIds (дедуп, без создателя, неизвестные отбрасываются), частичная матрица прав                                                                                                                                             |
| `GET /conversations/direct/:userId`                                 | Find-or-create (вкл. «Заметки» с собой): 200 существующая / 201 созданная; 404 нет юзера                                                                                                                                                                       |
| `PATCH /conversations/:id`                                          | Персональные pinned/muted/snoozed/hidden                                                                                                                                                                                                                       |
| `PUT /conversations/:id/draft`                                      | Черновик: пустой текст = удаление; revision монотонно растит сервер (LWW)                                                                                                                                                                                      |
| `GET /conversations/:id/messages`                                   | Лента ВСЕХ сообщений беседы ASC (страница — новейшие, курсор назад по seq; ответы тредов — инлайн, как в моках: прямой/групповой чат рендерит их плоско, канальный вид фильтрует корни клиентом) или тред (`?threadRootId=`: корень первым на первой странице) |
| `POST /conversations/:id/messages`                                  | Отправка: seq+вставка+вложения+гашение черновика/snooze+события в одной tx                                                                                                                                                                                     |
| `PATCH .../messages/:messageId`                                     | Правка текста (только автор; editedAt только при реальной смене)                                                                                                                                                                                               |
| `DELETE .../messages/:messageId`                                    | 204 бесследно (никто не читал) / 200 надгробие                                                                                                                                                                                                                 |
| `POST .../messages/batch-delete`                                    | Свои: `{removed[], tombstones[]}`; чужие/удалённые пропускаются                                                                                                                                                                                                |
| `POST .../messages/:messageId/pin` · `DELETE .../pin` · `GET /pins` | Закрепы (идемпотентный pin, свежие первыми)                                                                                                                                                                                                                    |
| `POST .../messages/:messageId/reactions`                            | Toggle `{emoji, remove?}` → сообщение                                                                                                                                                                                                                          |
| `POST /conversations/:id/forward`                                   | Копии в эту беседу: комментарий ПЕРЕД блоком; forwardedFrom=оригинальный автор                                                                                                                                                                                 |

Вне контура до смежных треков: `POST .../to-task` (трек задач), вложения
`POST /chat/attachments` (после #57 — MinIO/StorageDriver; таблица и
одноразовая привязка `attachmentIds` уже готовы), автоканалы проектов.
Realtime-доставка/typing/presence — WS-gateway (#104, `apps/gateway`).
TTL/автоудаление сообщений — вне продукта навсегда
(решение владельца 24.09, #96).

## События (outbox, I9; каталог — api-conventions.md, схемы — contracts)

`chat.conversation_created` · `chat.member_added` · `chat.message_sent`
(+`thread_created` первым ответом) · `chat.message_edited` ·
`chat.message_deleted` (payload.obliterated) · `chat.message_read` (upToSeq) ·
`chat.message_pinned` / `chat.message_unpinned` · `chat.reaction_added` /
`chat.reaction_removed`. Payload минимальный и клиентски видим (будущий
WS-fanout рассылает те же события).

## Лимиты

- Текст сообщения ≤ 4000, черновик ≤ 4000, частичная цитата ≤ 1024 (усечение
  снапшота — 160), batch/forward ≤ 100 сообщений, участников ≤ 200.
- Пагинация ≤ 100 (дефолт 50); курсоры opaque base64url.
- Вложения (после #57): 100 МБ/файл, 20/сообщение, привязка одноразовая.

## Тесты

- Unit: permissions, reply-snapshot, computeReadAt, cursor.util, сервисы
  (моки репозиториев).
- Integration (живые PG/Redis, `test:integration`): контракты всех маршрутов,
  гонки (параллельный дубль отправки → 1 строка; 20 параллельных вставок →
  seq 1..20 без дыр; find-or-create race → 1 беседа), пагинация без
  потерь, outbox-атомарность, unread/readAt циклы.
