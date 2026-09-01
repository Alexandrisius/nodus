# Конвенции API и каталог доменных событий

Читать: перед изменением любого API-эндпоинта, DTO или события.

## API

- REST, префикс `/api/v1`; OpenAPI-спецификация генерируется из кода (NestJS decorators), публикуется на `/api/docs` только для авторизованных.
- Запрос/ответ — JSON; ошибки — единый формат `{ code, message, details?, traceId }`; коды ошибок — перечисление в `packages/contracts`.
- Мутации принимают заголовок `Idempotency-Key` (генерируется клиентом); повторный запрос с тем же ключом возвращает первый результат.
- Списки: курсорная пагинация `?cursor=&limit=` (≤ 100, по умолчанию 50), сортировка детерминирована. **Ответ списка — `{ items, nextCursor }`** (`nextCursor` — opaque-токен или `null`); totals/offset/pageInfo не возвращаются.
- Все даты — UTC ISO 8601.
- **Универсальная адресуемость:** каждая сущность портала (и каждый адресуемый внешний объект — элемент BIM-модели, позиция каталога ресурсов, пункт нормативного документа) имеет стабильный URI вида `portal://{тип}/{id}` и соответствующий deep link. Слайдеры, связи EntityLink, будущие ИИ-агенты и модули ссылаются на объекты только через этот URI.
- WebSocket-протокол: gateway рассылает **доменные события каталога ниже с теми же именами** (например `chat.message_sent`, `task.updated`), envelope `{ type, payload, seq, ts }`; клиент хранит `seq` для догрузки пропущенного после reconnect. Отдельного WS-каталога не существует — маппинг имён не требуется.
- Изменение API = обновление zod-схем в `packages/contracts` и OpenAPI-аннотаций **в том же коммите**.

## Сквозные механизмы каждой мутации (I7, I9)

- Каждая мутация API идемпотентна (`Idempotency-Key`, client-generated ID).
- Каждое изменение сущности — доменное событие через transactional outbox (запись в `events` в той же транзакции, что и изменение).
- Каждое действие пользователя — запись в аудит.
- Тяжёлые операции (отчёты, конвертация превью, дайджесты) — только фоновые задачи BullMQ; HTTP-запрос тяжёлую работу не выполняет.

## Каталог доменных событий (расширяется только добавлением)

```
directory.user.created / updated / deactivated
project.created / updated / stage_changed / member_added
task.created / updated / status_changed / stage_changed / assigned / completed / overdue
task.time_logged
chat.message_sent / message_edited / message_read / reaction_added / member_added / thread_created
correspondence.letter_received / letter_registered / letter_sent
correspondence.resolution_issued            # → порождает task.created (source=letter)
workflow.instance_started / step_completed / approved / rejected / escalated
file.uploaded / preview_ready / version_added
notification.dispatch_requested            # единая точка входа для диспетчера каналов
custom_field.definition_changed / value_changed  # агрегат + код поля + старое/новое значение
```

**Правила событий:**
- Префикс = имя модуля-владельца в единственном числе (`tasks` → `task`, `workflows` → `workflow`, `correspondence` → `correspondence`); дефисы в имени модуля заменяются подчёркиваниями (`custom-fields` → `custom_field.*`).
- Событие — факт в прошедшем времени; payload минимальный (id + ключевые поля), подробности подписчик дочитывает через API.
- Каталог только расширяется: переименование и удаление существующих событий запрещено (это ломает подписчиков и историю). Новое событие — сначала в этот каталог в том же коммите.

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
