---
title: Implement Structured JSON Logging for Production
impact: HIGH
section: 4
impactDescription: Enables debugging, monitoring, and audit trails
tags: logging, monitoring, debugging, production, pino
---

> **Note:** For per-class context and log-level habits, see `error-handling-logger-context.md`. This rule covers the production logging pipeline: structured JSON, automatic request context, secret redaction.

`console.log` has no structure, no levels, no request correlation — and in a container it is just unstructured stdout that Grafana/Loki can't query. Nodus logs with **pino** via `nestjs-pino`: pino is the native logger of our HTTP stack (Fastify is built on it), it is the fastest Node.js JSON logger, and `nestjs-pino` binds **request context to every log line** — `req.id`, method, url — without REQUEST-scoped providers.

The payoff: the `traceId` in every API error response (`error-handling-exception-filter.md`) is the same `req.id` present on every log line of that request. A user reports an error id → one log query shows the whole request story.

```bash
pnpm add nestjs-pino pino
pnpm add -D pino-pretty   # human-readable output in development only
```

## For AI Agents

### Step 1: Configure the Logger Module (core)
**File:** `apps/api/src/core/logging/logging.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

const isProduction = process.env.NODE_ENV === 'production';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        // ✅ Level from env; debug/verbose never reach production output
        level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),

        // ✅ JSON lines in production (Loki/Grafana ingests them);
        //    pino-pretty only on developer machines
        transport: isProduction ? undefined : { target: 'pino-pretty' },

        // ✅ Redaction is configured once, centrally. pino replaces these
        //    paths with "[Redacted]" in every log line — including errors
        //    that serialize request objects.
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["x-refresh-token"]',
            'res.headers["set-cookie"]',
            'body.password',
            'body.refreshToken',
            '*.password',
            '*.refreshToken',
          ],
          censor: '[Redacted]',
        },

        // ✅ Health probes and metrics scrapes must not spam the log stream
        autoLogging: {
          ignore: (req) => (req.url ?? '').startsWith('/health'),
        },

        // Fastify already assigns req.id (x-request-id honored, genReqId
        // otherwise — see error-handling-logger-context.md); nestjs-pino
        // logs it as req.id on every line of the request.
      },
    }),
  ],
})
export class LoggingModule {}
```

Register `LoggingModule` once in the root `AppModule` (via `CoreModule`). In `main.ts` wire it as the app logger so Nest's own startup/shutdown messages go through pino too:

```typescript
// apps/api/src/main.ts
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ genReqId: () => randomUUID() }),
    { bufferLogs: true }, // hold startup logs until pino is ready
  );
  app.useLogger(app.get(Logger));

  await app.listen(Number(process.env.API_PORT), '0.0.0.0');
}
```

### Step 2: Inject PinoLogger with Class Context

```typescript
// ✅ REQUIRED: inject a per-class logger — output carries context automatically
import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

@Injectable()
export class TasksService {
  constructor(
    @InjectPinoLogger(TasksService.name)
    private readonly logger: PinoLogger,
    private readonly tasksRepository: TasksRepository,
    private readonly tx: TransactionRunner,
    private readonly eventBus: EventBus,
  ) {}

  async createTask(dto: CreateTaskDto, userId: string) {
    // ✅ identifiers and shapes, never credentials or whole request bodies
    this.logger.info({ title: dto.title, assigneeId: dto.assigneeId }, 'Creating task');

    const task = await this.tx.run(async (tx) => {
      const created = await this.tasksRepository.create(dto, tx);
      await this.eventBus.emit(tx, 'task.created', {
        taskId: created.id,
        projectId: created.projectId,
        assigneeId: created.assigneeId,
      });
      return created;
    });

    this.logger.info({ taskId: task.id }, 'Task created');
    return task;
  }
}
```

Every line inside a request automatically includes the request context:

```json
{
  "level": 30,
  "time": 1768900000000,
  "pid": 1,
  "hostname": "nodus_api",
  "req": { "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479", "method": "POST", "url": "/api/v1/tasks" },
  "context": "TasksService",
  "taskId": "a1b2c3",
  "msg": "Task created"
}
```

Outside HTTP requests (BullMQ workers, event handlers, startup) there is no `req` — pass correlation explicitly: `this.logger.info({ jobId, taskId }, 'Preview generated')`.

### Step 3: Enrich the Request Context with `assign`

```typescript
// ✅ Fields assigned once appear on every subsequent log of THIS request —
//    no plumbing through method signatures, no REQUEST-scoped providers.
import { Controller, Post, Body } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuthController.name);
  }

  @Post('login')
  async login(@Body(new ZodValidationPipe(loginSchema)) dto: LoginDto) {
    const session = await this.authService.login(dto);

    // From here on, every log line in this request (including service logs)
    // carries userId — and the password is nowhere near the logs thanks to redact.
    this.logger.assign({ userId: session.userId });

    this.logger.info('User logged in');
    return session;
  }
}
```

In event handlers and workers, establish context the same way at the top of the handler: `this.logger.assign({ eventId, eventType })` — consumers of the `task.created` fanout become greppable per event.

### Step 4: Log Errors with the Error Object

```typescript
// ✅ pino serializes the `err` key: message + stack + cause chain.
//    The global exception filter logs this way; services log-and-rethrow.
try {
  await this.tasksRepository.markCompleted(id, new Date(), tx);
} catch (error) {
  this.logger.error({ err: error, taskId: id }, 'Failed to complete task');
  throw error;
}

// ❌ WRONG - stringifying loses the stack and structure
this.logger.error(`Failed: ${error}`);

// ❌ WRONG - message-only, no error at all
this.logger.error('Something went wrong');
```

### Step 5: What Must Never Reach the Logs

- Passwords, refresh/access tokens, session cookies — covered by central `redact` paths; if you add a new secret-shaped field (API keys, SMTP credentials), add its path to `redact` in the same commit.
- Full request/response bodies. Log selected fields (`{ taskId, stageId }`), never `JSON.stringify(body)`.
- Personal data beyond what debugging needs: prefer internal ids (`userId`) over emails/names in routine lines.
- Prisma query args with values (may contain PII) — log operation shape only (`model.operation`, duration), as in `database-parameterized-queries.md`.

**Incorrect:**

```typescript
// 🚨 console.log debugging — no levels, no context, no redaction
console.log('Creating user:', data);
try {
  const user = await this.prisma.user.create({ data });
  console.log('User created:', user.id);
} catch (error) {
  console.error('User creation failed:', error);
}

// 🚨 Per-service hand-rolled loggers — five formats, no request context,
//    no central redaction. One pipeline (core LoggingModule), configured once.

// 🚨 Logging secrets directly — redact can't help if you concatenate first
this.logger.info(`Login with ${email}:${password}`);

// 🚨 File transports inside containers — container logs go to stdout;
//    shipping/rotation/retention belong to the Docker/Grafana layer,
//    not to the application process.
```

**Correct:**

```typescript
// ✅ users/users.service.ts
import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

@Injectable()
export class UsersService {
  constructor(
    @InjectPinoLogger(UsersService.name)
    private readonly logger: PinoLogger,
    private readonly usersRepository: UsersRepository,
  ) {}

  async createUser(data: CreateUserDto) {
    this.logger.info({ email: data.email }, 'Creating user');

    try {
      const user = await this.usersRepository.create(data);
      this.logger.info({ userId: user.id }, 'User created');
      return user;
    } catch (error) {
      this.logger.error({ err: error, email: data.email }, 'User creation failed');
      throw error;
    }
  }
}
```

## Production Topology

- The process writes **JSON lines to stdout only**. Docker captures stdout; the pilot profile ships it to Grafana/Loki. No file transports, no rotation logic in the app (I11 — everything self-hosted, nothing leaves the box).
- BullMQ workers and the outbox fanout run in the API process — they log through the same pino instance; without `req`, include `jobId`/`eventId` explicitly.
- Log volume control is the `LOG_LEVEL` env var (`.env`, per environment) — no redeploy needed to turn on `debug` during an incident.

## Quick Reference Checklist

- [ ] `LoggerModule.forRoot` configured once in `core`, registered via root module
- [ ] `app.useLogger(app.get(Logger))` with `bufferLogs: true` in `main.ts`
- [ ] JSON in production, `pino-pretty` only outside production
- [ ] Central `redact` covers authorization/cookie/password/token fields — extended whenever a new secret field appears
- [ ] `autoLogging.ignore` excludes `/health` probes
- [ ] Services use `@InjectPinoLogger(Class.name)`, never `console.*`
- [ ] Errors logged as `{ err: error, ...ids }` and rethrown
- [ ] `logger.assign()` sets `userId` after auth and `eventId`/`jobId` in handlers/workers
- [ ] No file transports in the app; stdout only
- [ ] `traceId` in error responses matches `req.id` in logs (see `error-handling-exception-filter.md`)

**See also:** `error-handling-logger-context.md` for context/levels discipline; `deployment-health-checks.md` for the endpoints excluded from request logging.
