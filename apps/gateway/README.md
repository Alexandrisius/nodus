# apps/gateway — @nodus/gateway

WebSocket-gateway портала (I1: отдельный процесс): Socket.IO — auth-хендшейк,
комнаты бесед, fanout доменных событий чата из Redis Stream, «печатает…»,
presence. Спека — issue #104 (трек M13).

## Запуск

- `pnpm dev` — `node --watch src/main.ts` (Node 24 исполняет TS напрямую, type stripping; поэтому относительные импорты — с `.ts`-расширением, tsc переписывает их на `.js` при сборке через `rewriteRelativeImportExtensions`).
- `pnpm build && pnpm start` — прод-режим из `dist/`.
- Порт: `GATEWAY_PORT` (по умолчанию 3002); проверка живости — `GET /health`.
- Env (zod на старте): `JWT_SECRET` (тот же, что у apps/api), `REDIS_URL`, `DATABASE_URL`. В docker-compose переменные пробрасываются сервису.

## Архитектура

- **Fanout**: api после коммита пишет `chat.*` в outbox (`events`); издатель
  `RedisStreamPublisher` (apps/api, `core/events`) публикует их в Redis Stream
  `nodus:chat:events` (опрос по монотонному `events.seq`, ~100 мс — бюджет
  p95 доставки < 200 мс). Gateway — consumer group `nodus:gateway` (XREADGROUP
  BLOCK), рассылает envelope **`{ type, payload, seq, ts }`** (канон
  api-conventions.md; seq = events.seq, глобальный порядок) по комнатам из
  payload. Группа создаётся на `$` — историю не ретранслируем: клиент,
  пропустивший события, ресинхронизируется рефечем (сервер — истина).
- **READ-ONLY Postgres — осознанное исключение I3/I6** (зафиксировано спекой
  #104): gateway не тянет Nest/Prisma ради двух SELECT — `isMember` для
  подписки на комнату и `display_name/avatar_url` для presence-entries (кэш
  60 с). Пишет в чужие таблицы никогда.
- **Stateless, но пилот — один инстанс**: горизонтальное масштабирование —
  Redis-адаптер Socket.IO (задел; consumer group уже разделяемая). Доступ из
  браузера — один origin с web (nginx/vite проксируют `/socket.io`), свой
  CORS не настраивается.

## Протокол (клиент ↔ gateway)

| Направление     | Событие                               | Payload                                                                                                                                                                                                  |
| --------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| клиент → сервер | `conv:join`                           | `{conversationId}` + ack `{ok, error?}` — подписка на комнату беседы (только член; `bad_request`/`forbidden`/`room_limit`/`unavailable`)                                                                 |
| клиент → сервер | `conv:leave`                          | `{conversationId}`                                                                                                                                                                                       |
| клиент → сервер | `chat.typing`                         | `{conversationId, threadRootId?}` — троттл ~3 с на пользователя-беседу(-тред); рассылка: conv-комната + user-комнаты участников без автора (threadRootId — печать в трэде: ТОЛЬКО conv-комната, раунд 3) |
| сервер → клиент | `chat.*` (каталог api-conventions.md) | envelope `{type, payload, seq, ts}`                                                                                                                                                                      |
| сервер → клиент | `chat.typing`                         | `{conversationId, userId, threadRootId?}` — кроме сокетов автора; threadRootId показывает шапка окна треда, списки бесед его игнорируют                                                                  |
| сервер → клиент | `presence.snapshot`                   | `{entries: PresenceEntry[]}` — подключившемуся                                                                                                                                                           |
| сервер → клиент | `presence.updated`                    | `PresenceEntry` — всем (комната `presence`)                                                                                                                                                              |

Комнаты: `conv:{conversationId}` — join только членам, потолок 50/сокет;
`user:{userId}` — автоматически после auth; `presence` — все аутентифицированные.

Роутинг событий: беседа → `conv:{id}`; `message_sent/edited/deleted` → плюс
user-комнаты участников (список бесед); `message_read` → `conv:{id}` +
`user:{reader}`; `conversation_created/member_added` → user-комнаты затронутых.
**`chat.typing` (раунд 2 #104, модель Telegram; раунд 3 — трэды)**: помимо
комнаты беседы — user-комнаты остальных участников (SELECT members,
механизм message_sent) — индикатор живёт и в СПИСКЕ чатов; автор из
user-рассылки исключён (свои вкладки свою печать не видят), своя печать не
показывается и на клиенте. Печать с `threadRootId` (раунд 3) идёт ТОЛЬКО в
conv-комнату (троттл-ключ включает root): индикатор — шапка окна треда, в
список бесед и шапки каналов не попадает.
Клиент применяет события **только как сигнал к рефечу** (invalidateQueries) —
локального применения состояний нет; порядок seq может нарушаться поздними
коммитами транзакций api — это безопасно.

## Известные границы (заделы)

- **Reconnect-догрузка по seq**: клиент хранит seq (в envelope), но REST-эндпоинт
  `/events?after_seq=` ещё не нужен — после reconnect клиент инвалидирует всё
  чат-дерево ключей и рефечит. Появится при масштабировании истории.
- **Auth**: stateless HS256 (тот же формат, что apps/api); сессии (sid) не
  проверяются — отозванная сессия живёт ≤ TTL access-токена (15 мин).
- **Presence**: только online/offline (away в контракте — задел); эфемерно,
  в БД не хранится. Снимок приходит подключению, обновления — всем.
- Структурное логирование (pino) — вместе с core-механизмами (issue #2/#3).

## Тесты

- Unit (`pnpm test`): auth-верификатор, троттл typing, роутинг fanout,
  presence-переходы, conv:join/leave (членство, потолок, идемпотентность).
- Integration (`pnpm test:integration`, живые PG/Redis): собственный контур —
  БД `nodus_gateway_test` с минимальным срезом читаемых таблиц; socket.io-client
  против живого сервера; публикация в стрим XADD-ом contract-ного envelope.
  api-сторона публикации покрыта apps/api/test/integration/chat-realtime-fanout.
- Нагрузка (k6 0.58, `docker run --rm grafana/k6:0.58.0`, из репо
  `MSYS_NO_PATHCONV=1`, api/gateway доступны как `host.docker.internal`):
  - `perf/ws-spike.js` — спайк raw engine.io-фрейминга для k6;
  - `perf/chat-ws-load.js` — прежний профиль: 50 соединений, 10 минут;
  - `perf/super-load.js` — стресс-лестница «предел прочности» (#117): ступени
    300→2000 сокетов, микс операций (отправка 55% / typing 15% / read 15% /
    реакции 10%), метрика доставки на собственном сокете; оркестрация
    `tools/run-ladder.sh`;
  - `perf/churn-storm.js` — волны массовых connect/disconnect (presence-
    snapshot под нагрузкой, утренний вход офиса);
  - `perf/login-storm.js` — честный argon2-логин с постоянной интенсивностью;
  - `perf/hour-soak.js` — часовой профиль НФТ: 300 сокетов, ~500 сообщ/мин,
    p95 < 200 мс, саморазрывы сокетов + внешний рестарт gateway на 30-й
    минуте (массовый реконнект, #119); оркестрация `tools/run-soak.sh`.
- Мир нагрузки: `tools/bots.mjs` генерирует ботов-сотрудников и беседы в БД
  напрямую (SQL для psql) и HS256-токены ботов (payload как у token.service,
  permissions копией реального админа) в `run/world.json` (git-ignored).
  Вычистка: `run/cleanup.sql`. Общий движок бота — `perf/lib/bot-engine.js`
  (engine.io-фрейминг, join по ack, pending-матчинг доставки — событие может
  прийти раньше HTTP-ответа отправки).
- Мониторинг прогонов: `tools/monitor.sh` (CPU/RAM контейнеров, активные
  PG-сессии, события/мин, длина стрима и pending consumer-группы).

### Известная ловушка: два consumer'а в группе `nodus:gateway`

Любой второй живой reader группы (например, забытый dev-gateway на хосте с
`REDIS_URL=redis://localhost:6379`, контур портов это допускает) ЗАБИРАЕТ
записи XREADGROUP'ом и ACK-ает их в никуда — события чата бесследно
теряются для онлайн-клиентов, pending остаётся 0, ошибок в логах нет.
Перед k6-прогонами против прода: `XINFO CONSUMERS nodus:chat:events
nodus:gateway` — активен должен быть ровно один (`gateway-<pid>` контейнера).
Мотивирует задел «GC мёртвых consumers» (#117) — но живой сирота опаснее
мёртвых: молчаливая потеря данных.
