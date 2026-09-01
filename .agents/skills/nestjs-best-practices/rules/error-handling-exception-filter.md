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

- `code` — machine-readable error code from the enumeration in `@nodus/contracts` (a system constant — enums are allowed for these, I15). Clients switch on `code`, never on HTTP status alone and never on `message` text.
- `message` — human-readable, safe to show (Russian UI strings are chosen client-side from i18n by `code`; `message` is for logs and debugging).
- `details?` — optional structured payload (validation issues, conflicting field, retry hints).
- `traceId` — the Fastify request id; identical to the `reqId` in structured logs and to the value shown in support tickets.

**Two companion rules:**

1. **Success responses have no envelope.** No `{ success, data, timestamp }` wrappers, ever. Single resource → the resource JSON; list → `{ items, nextCursor }`. Only errors have a fixed envelope — the one above.
2. **Services throw domain exceptions, not HTTP exceptions.** A service doesn't know HTTP (patterns.md); it throws `DomainException` subclasses carrying a code from `@nodus/contracts`. Mapping to HTTP status happens in the core filter, in one place.

> **Hint**: The filter must handle four exception families explicitly — domain exceptions, Nest `HttpException` (framework/guard errors), `ZodError` (boundary validation), Prisma known errors — and a safe 500 fallback for everything else. Under the Fastify adapter, responses are written with `reply.code(status).send(body)`; the Express-style `res.status().json()` does not exist.

## Why the Global Filter Matters

**Without it:**

```json
// 🚨 Production response - LEAKS sensitive info!
{
  "statusCode": 500,
  "message": "select * from tasks where id = $1 - relation \"tasks\" does not exist",
  "stack": "Error: relation \"tasks\" does not exist\n    at Connection.parseE (/app/node_modules/pg/lib/connection.js:539:11)\n    at /app/apps/api/src/modules/tasks/tasks.service.ts:42:15"
}
```

**With it:**

```json
// ✅ Production response - Safe, actionable, correlates with logs
{
  "code": "INTERNAL_ERROR",
  "message": "Internal server error",
  "traceId": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```

The full error with stack is in the structured logs under the same `traceId` — support asks the user for the id, you grep the logs. Nothing internal crosses the wire.

## Error Contract (packages/contracts)

```typescript
// packages/contracts/src/errors/error-codes.ts
// System constants — enums are allowed here (I15: dictionaries are for
// business lists; error codes are a system-level protocol contract).
export enum ErrorCode {
  // System (canonical set — api-conventions.md)
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT', // covers idempotency-with-different-payload too
  RATE_LIMITED = 'RATE_LIMITED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',

  // Domain (extend as modules grow — catalog only grows, never renames)
  TASK_INVALID_STAGE_TRANSITION = 'TASK_INVALID_STAGE_TRANSITION',
  LETTER_ALREADY_REGISTERED = 'LETTER_ALREADY_REGISTERED',
  WORKFLOW_STEP_OUT_OF_ORDER = 'WORKFLOW_STEP_OUT_OF_ORDER',
}

export interface ApiErrorResponse {
  code: ErrorCode | string;
  message: string;
  details?: unknown;
  traceId: string;
}
```

## Domain Exceptions (core)

```typescript
// apps/api/src/core/errors/domain-exception.ts
import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@nodus/contracts';

/**
 * Base class for all business errors. Carries the contract error code and
 * its HTTP mapping, so services stay HTTP-agnostic: they throw
 * `new TaskNotFoundException(id)` and nothing else.
 */
export class DomainException extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly httpStatus: HttpStatus = HttpStatus.BAD_REQUEST,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
```

```typescript
// apps/api/src/modules/tasks/errors/task-not-found.exception.ts
import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@nodus/contracts';
import { DomainException } from '../../../core/errors/domain-exception';

export class TaskNotFoundException extends DomainException {
  constructor(taskId: string) {
    super(ErrorCode.TASK_NOT_FOUND, `Task '${taskId}' not found`, HttpStatus.NOT_FOUND);
  }
}

// apps/api/src/modules/tasks/errors/invalid-task-state.exception.ts
export class InvalidTaskStateException extends DomainException {
  constructor(message: string, details?: unknown) {
    super(ErrorCode.TASK_INVALID_STATE, message, HttpStatus.CONFLICT, details);
  }
}
```

**Usage in services** — business rules expressed as domain errors, no `HttpException` imports:

```typescript
// tasks/tasks.service.ts
@Injectable()
export class TasksService {
  async completeTask(id: string) {
    const task = await this.tasksRepository.findById(id);
    if (!task) throw new TaskNotFoundException(id);

    if (task.completedAt) return task; // idempotent

    if (await this.tasksRepository.hasOpenBlockingDependencies(id)) {
      throw new InvalidTaskStateException(
        'Cannot complete task: blocking dependencies are still open',
        { taskId: id },
      );
    }
    // ...tx + outbox event
  }
}
```

## The Global Filter (core)

```typescript
// apps/api/src/core/errors/all-exceptions.filter.ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { ErrorCode, ApiErrorResponse } from '@nodus/contracts';
import { DomainException } from './domain-exception';
import { PinoLogger } from 'nestjs-pino';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly logger: PinoLogger,
    private readonly isDevelopment: boolean,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    // Fastify assigns every request an id (x-request-id honored, genReqId
    // otherwise) — this is the traceId shared by logs and the error body.
    const traceId = String(request.id);

    const { status, body } = this.toError(exception, traceId);

    // ✅ Full error server-side, same traceId as the client sees
    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status} [${traceId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} -> ${status} ${body.code} [${traceId}]`,
      );
    }

    // ✅ Fastify reply API — no res.status().json() under the Fastify adapter
    reply.code(status).send(body);
  }

  private toError(
    exception: unknown,
    traceId: string,
  ): { status: number; body: ApiErrorResponse } {
    // 1) Domain exceptions — the canonical path
    if (exception instanceof DomainException) {
      return {
        status: exception.httpStatus,
        body: {
          code: exception.code,
          message: exception.message,
          ...(exception.details !== undefined ? { details: exception.details } : {}),
          traceId,
        },
      };
    }

    // 2) Zod errors — thrown by the boundary zod-pipe validating DTOs
    //    against schemas from @nodus/contracts
    if (exception instanceof ZodError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: {
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Validation failed',
          details: exception.issues.map((issue) => ({
            path: issue.path.join('.'),
            code: issue.code,
            message: issue.message,
          })),
          traceId,
        },
      };
    }

    // 3) Prisma known errors — mapped to safe contract codes
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrismaError(exception, traceId);
    }

    // 4) Nest HttpException — thrown by framework machinery (guards,
    //    pipes, 404 routes). Message is framework-generated, safe to pass.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        body: {
          code: this.codeFromHttpStatus(status),
          message: this.safeHttpMessage(exception),
          traceId,
        },
      };
    }

    // 5) Everything else — never leak internals for 5xx
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        code: ErrorCode.INTERNAL_ERROR,
        message:
          this.isDevelopment && exception instanceof Error
            ? exception.message
            : 'Internal server error',
        ...(this.isDevelopment && exception instanceof Error && exception.stack
          ? { details: { stack: exception.stack } }
          : {}),
        traceId,
      },
    };
  }

  private fromPrismaError(
    exception: Prisma.PrismaClientKnownRequestError,
    traceId: string,
  ): { status: number; body: ApiErrorResponse } {
    switch (exception.code) {
      case 'P2002': // unique constraint
        return {
          status: HttpStatus.CONFLICT,
          body: {
            code: ErrorCode.CONFLICT,
            message: 'A record with this value already exists',
            details: { fields: (exception.meta?.target as string[]) ?? [] },
            traceId,
          },
        };
      case 'P2025': // record not found
        return {
          status: HttpStatus.NOT_FOUND,
          body: { code: ErrorCode.NOT_FOUND, message: 'Record not found', traceId },
        };
      case 'P2003': // FK constraint
        return {
          status: HttpStatus.BAD_REQUEST,
          body: {
            code: ErrorCode.VALIDATION_FAILED,
            message: 'Referenced record does not exist',
            details: { field: exception.meta?.field_name },
            traceId,
          },
        };
      default:
        // Unknown Prisma errors fall into the 500 bucket without details
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          body: { code: ErrorCode.INTERNAL_ERROR, message: 'Internal server error', traceId },
        };
    }
  }

  private codeFromHttpStatus(status: number): ErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.VALIDATION_FAILED;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.UNAUTHENTICATED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCode.CONFLICT;
      default:
        return status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.VALIDATION_FAILED;
    }
  }

  private safeHttpMessage(exception: HttpException): string {
    const response = exception.getResponse();
    if (typeof response === 'string') return response;
    const message = (response as { message?: string | string[] }).message;
    return Array.isArray(message) ? message.join('; ') : message ?? exception.message;
  }
}
```

## Registering the Filter

Register through `APP_FILTER` in the core module so the filter gets constructor DI (logger, config). Do **not** instantiate filters manually in `main.ts` — that bypasses DI and you'll end up re-plumbing dependencies by hand:

```typescript
// apps/api/src/core/core.module.ts
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './errors/all-exceptions.filter';

@Module({
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class CoreModule {}
```

One filter is enough: `@Catch()` without arguments sees every exception type, and the `instanceof` cascade inside keeps the mapping logic in one reviewed place. Splitting into per-type filters (`@Catch(Prisma...)`, `@Catch(HttpException)`) is allowed but the relative order of `APP_FILTER` providers then becomes load-bearing and easy to break — prefer the single filter unless a module genuinely needs its own specialized handling.

## Controller and Response Shape

```typescript
// tasks/tasks.controller.ts — thin controller, no try/catch, no envelopes
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listTasksQuerySchema)) query: ListTasksQuery) {
    // ✅ List contract: { items, nextCursor } — the repository/service already
    //    return this shape; the controller passes it through untouched.
    return this.tasksService.getTasksPage(query.assigneeId, query.filter, query.cursor, query.limit);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    // ✅ Success = bare resource JSON. No { success: true, data: ... }.
    return this.tasksService.getById(id);
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(createTaskSchema)) dto: CreateTaskDto,
    @GetUser() user: AuthUser,
  ) {
    // ✅ No try/catch here — domain exceptions bubble to the global filter.
    //    The Idempotency-Key header is handled by the core idempotency
    //    interceptor, not by the controller.
    return this.tasksService.createTask(dto, user.id);
  }
}
```

**Incorrect:**

```typescript
// 🚨 main.ts — no global filter; default handler leaks internals
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}

// 🚨 Service throws raw Error — no code, no status mapping, leaks wording
@Injectable()
export class TasksService {
  async getById(id: string) {
    const task = await this.tasksRepository.findById(id);
    if (!task) throw new Error(`Task ${id} not found in database`);
    return task;
  }
}

// 🚨 Service throws HttpException — HTTP leaks into the domain layer,
//    and the response has no contract error code for the client
throw new NotFoundException('Task not found');

// 🚨 Controller catches and reshapes errors by hand — every endpoint
//    invents its own format; clients can't rely on anything
@Get(':id')
async get(@Param('id') id: string, @Res() res: Response) {
  try {
    const task = await this.tasksService.getById(id);
    return res.status(200).json({ success: true, data: task });
  } catch (e) {
    return res.status(500).json({ success: false, error: String(e) });
  }
}

// 🚨 Express-style response calls under the Fastify adapter —
//    res.status(...).json(...) does not exist on FastifyReply
@Catch()
export class BrokenFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    res.status(500).json({ message: 'oops' }); // runtime failure
  }
}
```

**Correct:**

- Services throw `DomainException` subclasses with codes from `@nodus/contracts`.
- The single core `AllExceptionsFilter` maps every exception family to `{ code, message, details?, traceId }` and writes it with `reply.code(status).send(body)`.
- Success responses: bare resource, or `{ items, nextCursor }` for lists. No wrappers.
- 5xx bodies in production carry nothing but `INTERNAL_ERROR` + `traceId`; the stack is in the logs under the same id.

## Environment-Aware Detail Level

```typescript
// Registered with config in core module — development gets stacks in
// `details` for faster debugging; production never does.
{
  provide: APP_FILTER,
  useFactory: (logger: PinoLogger, config: ConfigService) =>
    new AllExceptionsFilter(logger, config.get('NODE_ENV') === 'development'),
  inject: [PinoLogger, ConfigService],
}
```

Development-only extras live exclusively in `details` (never replacing `code`), so client code paths stay identical across environments.

## Testing the Filter Contract

```typescript
// core/errors/all-exceptions.filter.test.ts
import { describe, it, expect, vi } from 'vitest';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { TaskNotFoundException } from '../../modules/tasks/errors/task-not-found.exception';
import { ErrorCode } from '@nodus/contracts';

function mockHost(requestId = 'req-1') {
  const send = vi.fn();
  const code = vi.fn(() => ({ send }));
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ code }),
      getRequest: () => ({ id: requestId, method: 'GET', url: '/api/v1/tasks/1' }),
    }),
  };
  return { host: host as never, code, send };
}

describe('AllExceptionsFilter', () => {
  const logger = { error: vi.fn(), warn: vi.fn() } as never;

  it('maps domain exceptions to the contract error format', () => {
    const filter = new AllExceptionsFilter(logger, false);
    const { host, code, send } = mockHost('req-99');

    filter.catch(new TaskNotFoundException('task-1'), host);

    expect(code).toHaveBeenCalledWith(404);
    expect(send).toHaveBeenCalledWith({
      code: ErrorCode.TASK_NOT_FOUND,
      message: "Task 'task-1' not found",
      traceId: 'req-99',
    });
  });

  it('hides internals of unknown errors in production', () => {
    const filter = new AllExceptionsFilter(logger, false);
    const { host, send } = mockHost();

    filter.catch(new Error('relation "tasks" does not exist'), host);

    const body = send.mock.calls[0][0];
    expect(body.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(JSON.stringify(body)).not.toContain('relation');
    expect(body.traceId).toBeDefined();
  });
});
```

## Summary: Exception Filter Best Practices

| Practice | Description |
|----------|-------------|
| One error envelope `{ code, message, details?, traceId }` | Clients handle errors by code; support correlates by traceId |
| Error codes from `@nodus/contracts` | Single source of truth, shared with the frontend |
| Domain exceptions in services | Domain layer stays HTTP-free; mapping lives in one filter |
| No success wrappers | Bare resource / `{ items, nextCursor }`; envelope is for errors only |
| Fastify reply API | `reply.code(status).send(body)` — not Express `res.status().json()` |
| Hide 5xx internals in production | Stack lives in logs under the same traceId |
| Map ZodError at the boundary | `details` carries `issues` — field-level errors for forms |
| Map Prisma known errors | P2002 → 409, P2025 → 404, P2003 → 400; unknown → 500 |
| Register via `APP_FILTER` | DI for logger/config; no manual wiring in `main.ts` |
