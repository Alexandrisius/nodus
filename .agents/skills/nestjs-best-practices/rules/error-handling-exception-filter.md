---
title: Enable Global Exception Filter
impact: CRITICAL
section: 4
impactDescription: Prevents stack trace leaks in production
tags: security, error-handling, production, exceptions
---

Default framework error handlers leak stack traces, SQL fragments and internal paths to clients. A single global exception filter in `core/` catches everything and returns the one Nodus error format:

```json
{ "code": "TASK_NOT_FOUND", "message": "Task not found", "traceId": "req-42" }
```

- `code` - machine-readable error code from `@nodus/contracts` (a system constant, I15). Clients switch on `code`, never on HTTP status alone and never on `message` text.
- `message` - English technical, for logs/debugging; Russian UI strings are chosen client-side from i18n by `code`.
- `details?` - optional structured payload (validation `issues`, conflicting field, retry hints).
- `traceId` - the Fastify request id (UUID from `genReqId` in `main.ts`); identical to the `traceId` in structured logs.

**Two companion rules:**

1. **Success responses have no envelope.** No `{ success, data, timestamp }` wrappers, ever. Single resource → the resource JSON; list → `{ items, nextCursor }`. Only errors have a fixed envelope - the one above.
2. **Services throw domain exceptions, not HTTP exceptions.** A service doesn't know HTTP (patterns.md); it throws `DomainException` carrying a code from `@nodus/contracts`. Mapping to HTTP status happens in the core filter, in one place.

> **Hint**: The filter handles four exception families explicitly - domain exceptions, `ZodError` (defensive boundary branch), Prisma known errors, Nest `HttpException` - plus a safe 500 fallback. Under the Fastify adapter, responses are written with `reply.status(status).send(body)`; the Express-style `res.status().json()` does not exist.

## Why the Global Filter Matters

**Without it** - production responses leak internals (SQL, stack, paths). **With it:**

```json
{ "code": "INTERNAL_ERROR", "message": "Internal server error", "traceId": "f47ac10b-..." }
```

The full error with stack is in the structured logs under the same `traceId` - support asks the user for the id, you grep the logs. Nothing internal crosses the wire.

## Error Contract (packages/contracts)

Implemented: `packages/contracts/src/errors/error-codes.ts` (const object, not enum) and `api-error-response.schema.ts` (zod schema):

```typescript
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',   // details.issues - field violations
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',                     // incl. idempotency with different payload
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
// Domain codes - by mask `MODULE_REASON` in the same contract
// (catalog only grows, never renames). ApiErrorResponse = zod schema
// { code, message, details?, traceId }.
```

## Domain Exceptions (core)

Implemented: `apps/api/src/core/errors/domain-exception.ts`. The ONLY error type thrown from services (patterns.md); carries the contract code + details; HTTP mapping lives in the filter.

```typescript
export class DomainException extends Error {
  constructor(
    readonly code: string,                    // ErrorCode or domain MODULE_REASON
    message: string,
    readonly details?: Record<string, unknown>,
    readonly httpStatus?: number,             // explicit override; default - derived from code
  ) { super(message); }

  static notFound(message: string, details?): DomainException;
  static forbidden(message: string, details?): DomainException;
  static conflict(message: string, details?): DomainException;
  static unauthenticated(message?): DomainException;
}
```

**Usage in services** - business rules as domain errors, no `HttpException` imports:

```typescript
const task = await this.tasksRepository.findById(id);
if (!task) throw DomainException.notFound(`Task '${id}' not found`);
if (await this.tasksRepository.hasOpenBlockingDependencies(id)) {
  throw new DomainException(
    'TASK_BLOCKING_DEPENDENCIES_OPEN',     // domain code MODULE_REASON → 400 by default
    'Cannot complete task: blocking dependencies are still open',
    { taskId: id },
  );
}
```

## The Global Filter (core)

Implemented: `DomainExceptionFilter` (`apps/api/src/core/errors/domain-exception.filter.ts`), registered via `APP_FILTER` in `AppModule` (DI for `PinoLogger`; never instantiate filters manually in `main.ts`). Its contract:

- **DomainException** → status from code map (`VALIDATION_FAILED`→400, `UNAUTHENTICATED`→401, `FORBIDDEN`→403, `NOT_FOUND`→404, `CONFLICT`→409, `RATE_LIMITED`→429, `INTERNAL_ERROR`→500); domain `MODULE_REASON` → 400 by default or the explicit `httpStatus` passed to the exception. `details` pass through.
- **ZodError** (defensive; the canonical path is `ZodValidationPipe` throwing `DomainException` itself) → 400 `VALIDATION_FAILED` with `details.issues` (`path`, `code`, `message`).
- **Prisma known errors** → safe codes without SQL: `P2002`→409 CONFLICT (`details.fields`), `P2025`→404 NOT_FOUND, `P2003`→400 VALIDATION_FAILED, unknown → 500.
- **HttpException** (guards, framework, 404 routes) → code derived from status; framework message passes through.
- **Everything else** → 500 `INTERNAL_ERROR`, `message: 'Internal server error'`; full error only in logs under the same `traceId`.

One filter is enough: `@Catch()` without arguments sees every exception type, and the `instanceof` cascade keeps the mapping in one reviewed place.

## Controller and Response Shape

```typescript
// tasks/tasks.controller.ts - thin controller, no try/catch, no envelopes
@Controller('tasks')
export class TasksController {
  @Get()
  list(@Query(new ZodValidationPipe(listTasksQuerySchema)) query: ListTasksQuery) {
    // List contract: { items, nextCursor } - passed through untouched.
    return this.tasksService.getTasksPage(query);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createTaskSchema)) dto: CreateTaskDto, @GetUser() user: AuthUser) {
    // No try/catch - domain exceptions bubble to the global filter.
    // Idempotency-Key is handled by the core idempotency interceptor.
    return this.tasksService.createTask(dto, user.id);
  }
}
```

**Incorrect:** no global filter (default handler leaks internals); `throw new Error(...)` from a service (no code, leaks wording); `throw new NotFoundException(...)` from a service (HTTP leaks into domain); controller try/catch reshaping errors by hand (every endpoint invents a format); Express-style `res.status().json()` under Fastify (runtime failure).

## Testing the Filter Contract

Unit tests live next to the filter (`domain-exception.filter.test.ts`): mock `ArgumentsHost` with a Fastify-like `{ id }` request and `{ status: () => ({ send }) }` reply; assert the envelope for each exception family (domain → code/status, `MODULE_REASON` → 400, `ZodError` → issues, unknown → 500 without internals). The end-to-end format is pinned by the integration test `test/integration/error-contract.integration.test.ts` against a live HTTP app, validating bodies with `apiErrorResponseSchema` from contracts.

## Summary: Exception Filter Best Practices

| Practice | Description |
|----------|-------------|
| One error envelope `{ code, message, details?, traceId }` | Clients handle errors by code; support correlates by traceId |
| Error codes from `@nodus/contracts` | Single source of truth, shared with the frontend |
| Domain exceptions in services | Domain layer stays HTTP-free; mapping lives in one filter |
| No success wrappers | Bare resource / `{ items, nextCursor }`; envelope is for errors only |
| Fastify reply API | `reply.status(status).send(body)` - not Express `res.status().json()` |
| Hide 5xx internals always | Stack lives in logs under the same traceId |
| Map ZodError at the boundary | `details.issues` - field-level errors for forms |
| Map Prisma known errors | P2002 → 409, P2025 → 404, P2003 → 400; unknown → 500 |
| Register via `APP_FILTER` | DI for logger; no manual wiring in `main.ts` |
