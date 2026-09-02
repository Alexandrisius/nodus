# Core: сквозные механизмы

Фундамент всех модулей (I7). Канонические имена и пути — `docs/architecture/patterns.md`
(раздел «Core-примитивы»); код расходиться с таблицей не должен.

## Состав

| Подпапка         | Примитивы                                                                           | Назначение                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `config/`        | `validateEnv()`                                                                     | Fail-fast валидация env при старте (zod); вызывается в `main.ts`                                                           |
| `database/`      | `PrismaService`, `TransactionRunner`                                                | Единственная точка PrismaClient (Prisma 7 + adapter-pg); `txRunner.run(async (tx) => …)` — канон транзакций                |
| `errors/`        | `DomainException`, `DomainExceptionFilter`                                          | Единственный тип ошибок сервисов; глобальный фильтр → `{ code, message, details?, traceId }`                               |
| `events/`        | `EventBus`, `EventDispatcher`                                                       | Outbox-запись в `events` в той же транзакции (I9); поллер доставляет подписчикам (at-least-once, дедуп `event_deliveries`) |
| `pipes/`         | `ZodValidationPipe`                                                                 | Валидация входа схемами `@nodus/contracts` → `VALIDATION_FAILED` с `details.issues`                                        |
| `guards/`        | `PermissionGuard`, `FeatureFlagGuard`                                               | RBAC на API (I8) и отключаемость модулей (I10)                                                                             |
| `decorators/`    | `@GetUser()`, `@RequirePermissions()`, `@Public()`, `@RequireFeature()`, `@Audit()` | Метаданные и доступ к текущему пользователю                                                                                |
| `interceptors/`  | `IdempotencyInterceptor`, `AuditInterceptor`                                        | Идемпотентность мутаций (ADR-0005, Redis) и аудит действий (`audit_logs`)                                                  |
| `feature-flags/` | `FeatureFlagService`                                                                | Флаги из БД с кэшем 5 с — тумблер без пересборки (I10)                                                                     |
| `redis/`         | `REDIS_CLIENT`                                                                      | Общий клиент ioredis; конвенция ключей `nodus:<module>:*`                                                                  |
| `audit/`         | `AuditRepository`                                                                   | Единственная точка записи в `audit_logs` (append-only)                                                                     |
| `crypto/`        | `PasswordService`                                                                   | Argon2id-хэширование паролей (глобально): auth проверяет, directory задаёт начальный — без межмодульных импортов (I3)      |
| `logging/`       | `LoggingModule`                                                                     | nestjs-pino: redact секретов, `traceId` = Fastify request.id                                                               |

## Правила использования модулями

- Транзакция: `this.txRunner.run(async (tx) => { …repo…; await this.eventBus.emit(tx, 'task.created', {...}) })`.
- Обработчик события: `events/<событие>.handler.ts` в модуле-подписчике, `static readonly eventType`, идемпотентен; регистрация — автоматически при bootstrap (DiscoveryService).
- Валидация: `@UsePipes(new ZodValidationPipe(schemaИзContracts))` на маршруте.
- Права: `@RequirePermissions(Permission.TASK_CREATE)`; публичный маршрут — `@Public()`.
- Мутации клиент шлёт с `Idempotency-Key` — механика сквозная, в модуле ничего не нужно.

## Лимиты и параметры

- Транзакция: таймаут 10 с.
- Outbox-поллер: 1 с, батч 50; single-process (I1) — при выносе в воркер добавить claim `FOR UPDATE SKIP LOCKED`.
- Идемпотентность: TTL ответа 24 ч, замок 5 с, ожидание результата 2 с (ADR-0005).
- Фичефлаг: кэш 5 с; неизвестный флаг = выключен; выключенный модуль отвечает NOT_FOUND.

## Тесты

- Unit — рядом с кодом (`*.test.ts`), `pnpm --filter @nodus/api test`.
- Интеграционные — `test/integration/` на реальных PG/Redis (`pnpm --filter @nodus/api test:integration`);
  локально используют docker-контейнеры `nodus_postgres`/`nodus_redis` и отдельную БД `nodus_test`.
