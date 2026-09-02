# Паттерны кода (принятые)

Каркасные паттерны проекта, зафиксированные до первой строки кода — чтобы каждый агент писал одинаково без угадывания. Обязательны; отклонение — через ADR. Детальные паттерны дополняются с первыми модулями (и упаковываются в навыки — `docs/process/skills.md`).

Читать: **перед написанием любого кода** в соответствующем слое.

## Бэкенд (NestJS): слоистость модуля

Каждый модуль `apps/api/src/modules/<name>/` строится одинаково:

```
<name>/
├── <name>.module.ts        # NestJS-модуль: wiring, без логики
├── <name>.controller.ts    # только HTTP: маршруты, DTO, OpenAPI-декораторы. Без бизнес-логики
├── <name>.service.ts       # бизнес-логика, транзакции, оркестрация
├── <name>.repository.ts    # ЕДИНСТВЕННАЯ точка доступа модуля к своим таблицам (Prisma)
├── dto/                    # request/response DTO — из zod-схем @nodus/contracts
├── events/                 # публикация доменных событий и обработчики чужих событий
└── README.md
```

Правила:

- **Repository pattern обязателен.** Prisma вызывается только в `*.repository.ts` модуля (и в `infra/`). Сервис не знает SQL/Prisma-клиента — работает с репозиторием через методы предметного языка (`findOverdueByAssignee`, а не `findMany({where: ...})`). Это держит логику тестируемой (репозиторий мокается) и даёт одну точку для индексов/партиций/софт-делита.
- **Чужие таблицы — запрещены.** Репозиторий модуля `tasks` не трогает таблицы модуля `chat` (I3, I6). Нужны данные другого модуля → событие или публичный контракт.
- **Controller тонкий:** валидация (zod pipe из contracts) → вызов service → ответ. Никаких `if` по бизнес-правилам.
- **Service без HTTP:** не знает про Request/Response; ошибки — доменные исключения с кодами из `@nodus/contracts`, маппинг в HTTP — глобальным фильтром (core).
- **Сквозное — через core, не руками:** RBAC — guards; аудит и идемпотентность — interceptors core; события — outbox-запись в той же транзакции через core EventBus (I7, I9). В сервисе это выглядит как `await this.eventBus.emit(tx, 'task.created', {...})` — никаких самодельных публикаций мимо outbox.
- **Обработчики событий** — отдельные файлы в `events/` модуля-подписчика, идемпотентные (событие может прийти повторно).

## Core-примитивы (канонические имена и пути)

Код использует только эти имена и пути. Альтернативные варианты (`DomainError`, `UnitOfWork`, `@CurrentUser`, `@OnEvent`, `SessionUser`...) **запрещены** — они расходятся между файлами. Реализация — в issue «Core: сквозные механизмы»; при расхождении кода с этой таблицей правится код и таблица в том же коммите.

| Примитив | Канон | Назначение |
|---|---|---|
| Доменное исключение | `DomainException` — `apps/api/src/core/errors/domain-exception.ts` | Единственный тип ошибок из сервисов (не HTTP-исключения); несёт `ErrorCode` + details |
| Коды ошибок / тип ответа | `ErrorCode`, `ApiErrorResponse` — `packages/contracts/src/errors/` | Базовый набор — `api-conventions.md`; доменные коды — по маске `MODULE_REASON` |
| Транзакции | `TransactionRunner` — `core/database/transaction-runner.ts` | Сервис: `this.txRunner.run(async (tx) => …)`; tx передаётся в репозиторий и `eventBus.emit(tx, …)`. `PrismaService` — только в репозитории, `infra/` и самом runner |
| Шина событий | `EventBus` — `core/events/event-bus.ts` | `emit(tx, 'module.action', payload)` — outbox-запись в той же транзакции; самодельные публикации запрещены |
| Обработчик события | `events/<событие>.handler.ts`, `static readonly eventType` | Регистрируется core при bootstrap; декораторы подписки (`@OnEvent`) запрещены; обработчик идемпотентен (дедуп по event id) |
| Таблица outbox | `events`: id, type, actor_id, aggregate_type, aggregate_id, payload JSONB, created_at, published_at | Append-only, по `data-model.md`; пишется только через EventBus |
| Валидация | `ZodValidationPipe` — `core/pipes/zod-validation.pipe.ts` | Схема из contracts передаётся явно: `@UsePipes(new ZodValidationPipe(createTaskSchema))` |
| Текущий пользователь | `@GetUser()` декоратор; тип `AuthUser` — `packages/contracts` | Не `@CurrentUser`/`SessionUser` |
| Права | `Permission` enum в contracts (`task.create` — точечная нотация); guard — `core/guards/permission.guard.ts`; декоратор `@RequirePermissions(Permission.TASK_CREATE)` | Не строковые литералы прав |
| Логирование | nestjs-pino (`PinoLogger`); `traceId` = Fastify `request.id` | Не кастомный AppLogger в request-scope |
| Ответ списка | `{ items, nextCursor }` | Без totals/offset/pageInfo |
| OpenAPI-ошибки | `ApiErrors(...статусы)` — `core/openapi/api-errors.decorator.ts` | Общая схема `apiErrorResponseSchema`, без ручных `@ApiResponse` |
| OpenAPI-идемпотентность | `@ApiIdempotencyKey()` — `core/openapi/api-idempotency.decorator.ts` | Заголовок `Idempotency-Key` на мутациях |

## Бэкенд (NestJS): OpenAPI-аннотации (спека из кода, I2)

Спецификация генерируется `@nestjs/swagger` из декораторов и публикуется на `/api/docs`
только для авторизованных (ADR-0006). Источник схем — **те же zod-схемы `@nodus/contracts`**,
что валидируют вход: одна схема = валидация + типы + документация (без дублирования).
Классические DTO с `@ApiProperty` **запрещены** (противоречит ADR-0001).

Правило: **новый/изменённый эндпоинт = аннотации в том же коммите** (критерий приёмки,
дублирует DoD «Изменение API = обновлены … и OpenAPI-аннотации»).

```
# Тело и query: schema — в опции декоратора маршрута (нативный Standard Schema, zod 4).
# pipes — валидация единым форматом; опция schema на рантайм не влияет.
@Post()
@ApiOkResponse({ standardSchema: userCardSchema })          # ответ — выходная сторона схемы
@ApiErrors(400, 401, 403, 409)                              # ошибки единого формата
@ApiIdempotencyKey()                                        # мутация → заголовок идемпотентности
create(@Body({ schema: createUserSchema, pipes: [new ZodValidationPipe(createUserSchema)] }) dto: CreateUserDto) { … }

@Get()
@ApiOkResponse({ standardSchema: paginatedSchema(userListItemSchema) })
list(@Query({ schema: listUsersQuerySchema, pipes: [new ZodValidationPipe(listUsersQuerySchema)] }) q: ListUsersQuery) { … }
```

Правила аннотирования:

- **Тело/параметры** — опция `schema` у `@Body`/`@Query` (массив `pipes` рядом); **ответы** — `standardSchema` у `@Api…Response`. Ответ — выходная сторона (`output`), тело — входная (`input`): конвертирует сам `@nestjs/swagger`.
- **Ошибки** — только через `@ApiErrors(…)` (общая схема `apiErrorResponseSchema`); не расписывать `@ApiResponse` для каждого кода вручную.
- **Мутации** (POST/PUT/PATCH/DELETE) — `@ApiIdempotencyKey()`; чтение — нет.
- **Безопасность** — контроллер/метод под `@ApiBearerAuth()`; публичные — `@Public()` и БЕЗ `@ApiBearerAuth` (health, login/refresh/logout).
- **Теги** — `@ApiTags('<модуль>')` на контроллере (`health`, `auth`, `directory`).
- **Списки** — ответ `paginatedSchema(itemSchema)`; query — курсорная схема (канон `{ items, nextCursor }`).
- **Терминус** (`/health/live|ready`) — своей zod-схемы нет, описывается локальным `SchemaObject` в контроллере.
- `/api/docs*` зарегистрирован в обход конвейера Nest, поэтому закрыт отдельным middie-посредником (`core/openapi/docs-auth.middleware.ts`), а не `JwtAuthGuard`.

## Фронтенд (React): структура фичи

Каждая фича `apps/web/src/features/<name>/` — зеркало backend-модуля:

```
<name>/
├── api/          # query keys factory + хуки TanStack Query + мутации (optimistic)
├── components/   # UI-компоненты фичи (глупые, на props)
├── pages/        # страницы (роутинг, композиция)
├── model/        # локальное состояние (Zustand), селекторы, типы фичи
└── README.md
```

Правила:

- **Query keys — только через factory** (`tasksKeys.list(filter)`, `tasksKeys.detail(id)`) в `api/`: инвалидация и оптимистичные апдейты опираются на них, руками строки ключей не пишутся.
- **Оптимистичная мутация — единый паттерн** (I4). Отклонение (пессимистичная мутация) — только с обоснованием в README фичи (юридически значимые действия):
  - `onMutate`: `cancelQueries` затронутых ключей → снапшот кэша → `setQueryData`: вставка временной записи с `id: temp-<uuid>` и флагом pending. Вставка — **только в те кэши списков, чьим фильтрам запись удовлетворяет**; в infinite-кэш — в первую страницу.
  - `onError`: откат по снапшоту + toast (строка из i18n).
  - `onSuccess`: замена временной записи серверным DTO (дубль на сервере не создаётся — запрос идёт с `Idempotency-Key`).
  - `onSettled`: инвалидация затронутых ключей.
  - Детерминированный тест: ответ сервера обёрнут в контролируемый deferred; assert — запись в кэше до resolve; затем reject → assert отката.
- **Данные — только через хуки `api/`.** Компоненты не дёргают fetch/axios напрямую. Формы — react-hook-form + zod-схема из `@nodus/contracts` (одна схема на фронт и бэк).
- **Моки MSW** — хендлеры фичи в `api/mocks/`, данные соответствуют контрактам (ADR-0001); мок ≠ контракту = баг.
- **UI-примитивы — из `@nodus/ui`**, не из локальных копий; токены темы не зашивать в компоненты (см. `docs/product/ux-principles.md`).
- React-нюансы (производительность, композиция) — навыки `react-best-practices` и `react-composition-patterns`, вызывать при работе с компонентами.

## Контракты (`packages/contracts`)

- Всё общее между фронтом и бэком — здесь и только здесь: zod-схемы DTO, типы событий, коды ошибок, константы прав, i18n-строки.
- Запрещено: дублировать DTO/типы в apps; логика и вычисления в contracts (только схемы, типы, константы); зависимости contracts от других пакетов.

## Тесты

- **Unit (Vitest):** рядом с кодом (`<сущность>.test.ts`), AAA (arrange/act/assert), бизнес-правила сервисов — с моком репозитория. Новая логика = тест в том же коммите.
- **Детерминированный тест оптимистичности:** мутация применена к кэшу клиента до resolve ответа сервера (без миллисекундных ожиданий — через контролируемый deferred).
- **E2E (Playwright):** только критичные пути (`docs/product/core-flows.md`), селекторы — role-based (`getByRole`), не CSS-классы; агент работает через `@playwright/cli`, тесты в CI — `npx playwright test`.
- **Интеграционные (API):** контрактные по OpenAPI, outbox, идемпотентность — на реальной тестовой БД (docker), не моках.

## Типичные ошибки (запрещено)

- Prisma в service/controller; импорт чужого репозитория; бизнес-`if` в контроллере.
- `fetch` в компоненте; строки query keys руками; пессимистичная мутация без обоснования.
- Дубль DTO в apps вместо contracts; публикация события мимо outbox; обработчик события без идемпотентности.
