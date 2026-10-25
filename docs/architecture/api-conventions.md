# Конвенции API и каталог доменных событий

Читать: перед изменением любого API-эндпоинта, DTO или события.

## API

- REST, префикс `/api/v1`; OpenAPI-спецификация генерируется из кода (декораторы контроллеров + те же zod-схемы `@nodus/contracts` через нативный Standard Schema, ADR-0006), публикуется на `/api/docs` только для авторизованных (middie-посредник с проверкой access-JWT — маршруты документации в обход гуардов). Паттерн аннотаций — `patterns.md`, «OpenAPI-аннотации».
- Запрос/ответ — JSON; ошибки — единый формат `{ code, message, details?, traceId }`; коды ошибок — перечисление в `packages/contracts`.
- Мутации принимают заголовок `Idempotency-Key` (генерируется клиентом); повторный запрос с тем же ключом возвращает первый результат.
- Списки: курсорная пагинация `?cursor=&limit=` (≤ 100, по умолчанию 50), сортировка детерминирована. **Ответ списка — `{ items, nextCursor }`** (`nextCursor` — opaque-токен или `null`); totals/offset/pageInfo не возвращаются.
- **Локальный поиск и фильтры списков (задел, I2):** поиск — `?q=` (подстрока по человекочитаемым полям сущности: номер/название/код); фильтры — `?filter[<поле>]=<значение>`, множественные значения через запятую, диапазоны дат — `filter[<поле>][from|to]`; поля фильтруемости объявляются в zod-схеме query списка (сейчас на моках фильтрация клиентская, `shared/views/list-filters`; на проде — серверная без смены контракта).
- Все даты — UTC ISO 8601.
- **Универсальная адресуемость:** каждая сущность портала (и каждый адресуемый внешний объект — элемент BIM-модели, позиция каталога ресурсов, пункт нормативного документа) имеет стабильный URI вида `portal://{тип}/{id}` и соответствующий deep link. Слайдеры, связи EntityLink, будущие ИИ-агенты и модули ссылаются на объекты только через этот URI.
- WebSocket-протокол: gateway рассылает **доменные события каталога ниже с теми же именами** (например `chat.message_sent`, `task.updated`), envelope `{ type, payload, seq, ts }`; клиент хранит `seq` для догрузки пропущенного после reconnect. Отдельного WS-каталога не существует — маппинг имён не требуется. Клиент применяет событие **локально в кэш без рефеча**, когда payload несёт полный DTO и локальная непрерывность проверяема (например `chat.message_sent`: эхо своей отправки заменяет темп по `clientMessageId`); рефеч — по дырам, правкам/удалениям и отсутствии кэша (сервер — единственная истина в последней инстанции). Эфемерные события транспортного слоя (`chat.typing`, `presence.*` — схемы в `packages/contracts/src/events/realtime.ts`) доменными не являются, в каталог не попадают и не персистятся.
- Изменение API = обновление zod-схем в `packages/contracts` и OpenAPI-аннотаций **в том же коммите**.

## Сквозные механизмы каждой мутации (I7, I9)

- Каждая мутация API идемпотентна (`Idempotency-Key`, client-generated ID). Значение ключа чата клампится 1–128 символов на входе (`readIdempotencyKey`): ключ становится broadcast-полем `clientMessageId` DTO/WS (#243); длиннее — сервер молча генерирует свой.
- Каждое изменение сущности — доменное событие через transactional outbox (запись в `events` в той же транзакции, что и изменение).
- Каждое действие пользователя — запись в аудит.
- Тяжёлые операции (отчёты, конвертация превью, дайджесты) — только фоновые задачи BullMQ; HTTP-запрос тяжёлую работу не выполняет.

## Каталог доменных событий (расширяется только добавлением)

```
# Реализованные (эмитятся кодом; payload-схемы — packages/contracts/src/**/*events*.ts)
directory.user.created / updated / deactivated  # deactivated — gateway рвёт WS-сокеты пользователя
workflow.type_created / type_updated / type_archived / published / layout_changed  # «Процессы» (ADR-0024, реализованы #428): каталог типов и маршрутов, без audience — всем; заменяют task.type_* / task.workflow_*
task.created / updated / status_changed / stage_changed / personal_stage_changed / assigned / completed / overdue
task.time_logged
task.participants_changed / checklist_changed / result_set / relation_changed / deleted / timer_started / timer_stopped
task.comments_counted  # пересчитан счётчик комментариев = сообщения беседы задачи (#252): клиенты ставят значение без рефеча досок
task.personal_stage_created / personal_stage_updated / personal_stage_archived / personal_stage_changed  # УСТАРЕВШИЕ после «Моих действий» (ADR-0026): личные колонки сняты; имена зарезервированы
task.type_created / type_updated / type_archived / workflow_published / workflow_layout_changed  # УСТАРЕВШИЕ (ADR-0024): движок в модуле «Процессы» — эмитятся `workflow.*`; имена зарезервированы, не эмитятся с #428
task.type_changed
chat.conversation_created / conversation_updated / member_added / member_removed / member_role_changed / message_sent / message_edited / message_deleted / message_read / message_pinned / message_unpinned / reaction_added / reaction_removed / thread_created
chat.favorite_added / favorite_removed / favorite_updated  # личные закладки #171: только user-комната владельца (не рассылается участникам)
chat.link_preview_ready  # превью ссылки дозрело фоном (#212, ADR-0018): комната беседы, клиенты патчат карточку без рефетча
chat.attachment_preview_ready  # серверная миниатюра вложения догенерилась фоном (#221): комната беседы, патч thumbnailUrl без рефетча
chat.sticker_pack_created / updated / deleted · chat.sticker_added / removed · chat.sticker_pack_installed / uninstalled  # стикер-сообщение rides на message_sent (вложение kind='sticker' со снапшотом пака, #143); payload пака несёт scope+audience: корпоративный — всем, личный — владелец+установившие (#318)
chat.attachment_updated  # мост file.version_created → беседы с этим вложением (#182)
file.version_created     # новая версия файла (колбэк ONLYOFFICE, #138)
notification.dispatch_requested / read  # dispatch — снимок для тоста; read — синхронизация вкладок
notification.acked       # выпилено ревизией 05.10 (ack-механика удалена), не эмитится; имя зарезервировано

# Задел (модуль ещё не реализован; имена зарезервированы — уточняются тем же PR, что вводит модуль)
directory.department.created / updated / archived
directory.position.created / updated / archived
directory.role.created / updated / deleted
dictionary.created / updated · dictionary.item_created / updated / deleted  # реализованы #431 (Р10): запись вариантов атрибутов; reorder эмитит dictionary.updated
workflow.press_recorded / press_round_completed   # «кнопку жмут несколько» (ADR-0025): отметка участника, кворум набран
project.created / updated / archived / participants_changed / roles_changed / node_created / node_updated / node_archived / schema_published  # ADR-0030
crm.counterparty_created / counterparty_updated / counterparty_archived / counterparty_restored / counterparty_deleted / contact_changed  # ADR-0033, реализованы #460
correspondence.letter_received / letter_registered / letter_closed_unregistered / letter_stage_changed / letter_updated / letter_sent  # ADR-0027
correspondence.assignments_requested        # «Расписать сразу»: черновики поручений с id → модуль задач создаёт задачи (source=letter), идемпотентно
correspondence.relation_changed / confidentiality_changed
custom_field.definition_changed  # #431: {definitionId, scope, change: created|updated|deleted|reordered, fields?} — каталожное; значение атрибута — в событии изменения сущности (task.updated.customFieldChanges[{fieldId, from, to}], ≤ 50, long_text обрезан до 500)
```

Поле `audience` в payload событий (`task.*`, `chat.sticker_*`) — служебная адресация для gateway (user-комнаты); клиенту не доставляется — gateway вырезает его до отправки (#328).

**Каталожные события** — `workflow.type_created / type_updated / type_archived / published / layout_changed`, `custom_field.definition_changed` и `dictionary.*` (реестр атрибутов и справочники видят все — gateway рассылает в presence-комнату, явный список `CUSTOM_FIELD_CATALOG_EVENTS`/`DICTIONARY_CATALOG_EVENTS`) (модуль «Процессы», #428; прежде — `task.type_* / task.workflow_*`, #378) — БЕЗ `audience` (`workflow.layout_changed` — сохранена расстановка холста без новой версии: клиент перечитывает только документ этого маршрута, кнопки задач не трогает): каталог типов и маршрутов виден всем, gateway рассылает их всем авторизованным сокетам (комната presence, паттерн корпоративных стикерпаков). Список каталожных событий у gateway — **явный** (`WORKFLOW_CATALOG_EVENTS`), а не префикс `workflow.`: у ADR-0025 будут некаталожные `workflow.*` со своей адресацией. Клиент инвалидирует типы/статусы/маршруты. Доменные данные события (составы `memberIds`/`userIds` событий беседы) уходят клиенту как есть.

**Правила событий:**
- Префикс = имя модуля-владельца в единственном числе (`tasks` → `task`, `workflows` → `workflow`, `correspondence` → `correspondence`); дефисы в имени модуля заменяются подчёркиваниями (`custom-fields` → `custom_field.*`).
- Событие — факт в прошедшем времени; payload минимальный (id + ключевые поля), подробности подписчик дочитывает через API.
- Каталог только расширяется: переименование и удаление существующих событий запрещено (это ломает подписчиков и историю). Новое событие — сначала в этот каталог в том же коммите. До пилота переименования допустимы решением владельца (`task.type_*` → `workflow.*`, #428/ADR-0024): старые имена остаются зарезервированными, история их читает.

## Коды ошибок (базовый набор, `packages/contracts/src/errors/`)

Системные коды, обязательные к единому использованию всеми механизмами (фильтр, пайпы, гварды, rate-limit):

```
VALIDATION_FAILED   # zod/валидация входа; details.issues — список нарушений
UNAUTHENTICATED     # нет/просрочена аутентификация
FORBIDDEN           # нет права (RBAC)
NOT_FOUND           # сущность не найдена / нет доступа
CONFLICT            # конфликт состояния (в т.ч. идемпотентность с иным payload)
RATE_LIMITED        # превышен лимит запросов
INTERNAL_ERROR      # непредвиденное (без деталей наружу)
```

Доменные коды — по маске `MODULE_REASON` (`TASK_INVALID_STAGE_TRANSITION`, `LETTER_ALREADY_REGISTERED`), регистрируются в том же enum contracts. `message` — английский технический (для логов/отладки); русские UI-строки клиент берёт из i18n по `code` (I15).

### Окно перехода и блок чата (#380)

- `POST /tasks/:id/transitions/:transitionId` принимает `form` (`.strict()`): `fields` (только поля раздела), `time` (1..1440 мин + дата), `result` (`text ≤ 5000`, `messageIds ≤ 50` уникальных), `comment ≤ 2000`. Состав сверяется с эффективным окном кнопки: лишнее или пропущенное обязательное — `422 TASK_TRANSITION_FORM_INVALID` (`details { transitionId, missing[], unexpected[] }`); гейт после окна — прежний `409 TASK_TRANSITION_BLOCKED` (`details.reasons`).
- `task.stage_changed` расширен (все поля optional — старые события их не несут): `recordId`, `transitionName ≤32`, `fromStageName ≤40`, `comment ≤2000`, `commentLabel ≤60`, `result { resultId, fileCount, messageCount }`. По ним чат пишет блок перехода.
- Вид сообщения: `kind` (`text | task_transition`; #313 добавит `system`) + `payload JSONB`; DTO сообщения — `kind` и `block` (закрытый union по виду, `null` при выключенном/битом payload). Правка блока запрещена (403).
- `GET /chat/conversations/:id/messages/lookup?ids=` — до 50 id, только участник (иначе 404), живые сообщения в порядке `seq`; отсутствующие молча выпадают.
