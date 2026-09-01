---
title: Use Domain Events via EventBus and Transactional Outbox
impact: HIGH
section: 3
impactDescription: Decouples modules and guarantees no event is lost
tags: architecture, events, event-bus, transactional-outbox, loose-coupling, i9
---

Direct service-to-service coupling between modules is forbidden in Nodus (I3, I6): feature modules may not import each other's providers at all. Modules communicate through **domain events** only. And because a lost event means silently inconsistent data, events are never published through a fire-and-forget in-memory emitter: every event is written to the `events` outbox table **in the same database transaction** as the state change (I9), then the core events module fans it out through Redis Streams to subscribers. **Never inject another module's service; never emit a domain event outside a transaction.**

> **Hint**: When a resolution is issued on an incoming letter, the correspondence module must not call the tasks module. It commits the resolution row plus a `correspondence.resolution_issued` outbox record in one transaction; the tasks module's handler consumes the event and creates the task with `source = letter`.

## For AI Agents

When implementing or reviewing cross-module communication, **always** follow these steps:

### Step 1: Check for Direct Cross-Module Injection

**Pattern to check:** Look for a service of one module injected into another module's service just to trigger side effects. In Nodus this is doubly wrong: it couples modules at runtime *and* violates ESLint-boundaries (I6) — the import itself will not compile.

```typescript
// ❌ WRONG - Tight coupling through direct injection (and an I6 boundary violation)
// apps/api/src/modules/correspondence/correspondence.service.ts
import { TasksService } from '../tasks/tasks.service';        // ❌ Cross-module import — forbidden
import { NotificationService } from '../notifications/notification.service'; // ❌

@Injectable()
export class CorrespondenceService {
  constructor(
    private readonly letters: LettersRepository,
    private readonly tasksService: TasksService,               // ❌ Only to create a task
    private readonly notificationService: NotificationService, // ❌ Only to notify
  ) {}

  async issueResolution(letterId: string, data: IssueResolutionDto, actorId: string) {
    const resolution = await this.letters.createResolution(letterId, data, actorId);

    // ❌ Direct calls to other modules' services
    const task = await this.tasksService.create({
      title: data.directive,
      assigneeId: data.assigneeId,
      deadline: data.deadline,
      source: 'letter',
    });
    await this.notificationService.notify(data.assigneeId, `New directive: ${data.directive}`);

    // ❌ If task creation throws, the resolution is already committed — inconsistent state
    // ❌ Adding a subscriber (audit, search index, analytics) means editing this module again
    // ❌ Testing CorrespondenceService requires mocking foreign modules

    return resolution;
  }
}
```

**If found:** replace with an outbox event emitted inside the same transaction (Steps 2–4).

### Step 2: Define the Event Contract in `@nodus/contracts`

Event names and payload schemas are shared system constants — they live in contracts, never in a module. Naming: `module.action`, module prefix in singular, past-tense fact. The catalog **only extends**: renaming or removing an existing event is forbidden (it breaks subscribers and history).

**File:** `packages/contracts/src/correspondence/correspondence.events.ts`

```typescript
import { z } from 'zod';

// ✅ REQUIRED: payload schema is the contract between publisher and all subscribers
export const resolutionIssuedPayloadSchema = z.object({
  resolutionId: z.string().uuid(),
  letterId: z.string().uuid(),
  directive: z.string(),
  assigneeId: z.string().uuid(),
  deadline: z.string().datetime().nullable(), // UTC ISO 8601
  actorId: z.string().uuid(),
});
export type ResolutionIssuedPayload = z.infer<typeof resolutionIssuedPayloadSchema>;

// ✅ Event names as constants — no string literals scattered across modules
export const CORRESPONDENCE_EVENTS = {
  RESOLUTION_ISSUED: 'correspondence.resolution_issued',
} as const;
```

**File:** `packages/contracts/src/task/task.events.ts`

```typescript
import { z } from 'zod';

export const taskCreatedPayloadSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string(),
  assigneeId: z.string().uuid().nullable(),
  creatorId: z.string().uuid(),
  source: z.enum(['manual', 'chat_message', 'letter']), // system constant set
  sourceId: z.string().uuid().nullable(),               // e.g. letterId
});
export type TaskCreatedPayload = z.infer<typeof taskCreatedPayloadSchema>;

export const TASK_EVENTS = {
  CREATED: 'task.created',
  STAGE_CHANGED: 'task.stage_changed',
  COMPLETED: 'task.completed',
} as const;
```

Keep payloads **minimal**: id + key fields. Subscribers that need more data read it through the owning module's public API — the event is a fact notification, not a data dump.

```typescript
// ❌ WRONG - Fat payload: snapshots go stale, schema becomes unmaintainable
{ taskId, title, description, assignee: { id, name, email, department }, project: { ... }, attachments: [...] }

// ✅ CORRECT - Minimal payload; subscribers fetch details if they need them
{ taskId, title, assigneeId, creatorId, source, sourceId }
```

### Step 3: Emit Inside the Transaction via EventBus

The core `EventBus.emit(tx, name, payload)` writes the outbox record using the transaction client, so the event commits or rolls back together with the state change. Emitting after commit — or through any other channel — is a bug.

**File:** `apps/api/src/modules/correspondence/correspondence.service.ts`

```typescript
// ✅ REQUIRED: state change + outbox record in one transaction
import { Injectable } from '@nestjs/common';
import { CORRESPONDENCE_EVENTS, ErrorCode } from '@nodus/contracts';
import { TransactionRunner } from '../../core/database/transaction-runner';
import { EventBus } from '../../core/events/event-bus';
import { DomainException } from '../../core/errors/domain-exception';
import { LettersRepository } from './correspondence.repository';

@Injectable()
export class CorrespondenceService {
  constructor(
    // ✅ Services never see the Prisma client — it lives only in repositories; transactions run via TransactionRunner
    private readonly txRunner: TransactionRunner,
    private readonly letters: LettersRepository,
    private readonly eventBus: EventBus,
  ) {}

  async issueResolution(letterId: string, data: IssueResolutionDto, actorId: string) {
    const letter = await this.letters.findById(letterId);
    if (!letter) throw new DomainException(ErrorCode.NOT_FOUND, 'Letter not found');

    return this.txRunner.run(async (tx) => {
      const resolution = await this.letters.createResolution(tx, letterId, data, actorId);

      // ✅ Outbox write joins THIS transaction — if anything rolls back, no phantom event exists
      await this.eventBus.emit(tx, CORRESPONDENCE_EVENTS.RESOLUTION_ISSUED, {
        resolutionId: resolution.id,
        letterId,
        directive: data.directive,
        assigneeId: data.assigneeId,
        deadline: data.deadline,
        actorId,
      });

      return resolution;
    });
    // ✅ CorrespondenceService knows nothing about tasks, notifications, audit — they subscribe
  }
}
```

What the outbox record looks like (core-owned table; shown to illustrate the contract):

```prisma
// apps/api/prisma/schema.prisma — owned by the core events module
model Event {
  id            String    @id @default(uuid())
  type          String    // 'correspondence.resolution_issued'
  actorId       String?
  aggregateType String?   // 'letter', 'task', ...
  aggregateId   String?
  payload       Json      // validated against the contracts zod schema
  traceId       String?
  createdAt     DateTime  @default(now())
  publishedAt   DateTime? // null until the relay has pushed it to Redis Streams

  @@index([publishedAt, id])
}
```

After commit, the core relay reads unpublished rows, pushes them to Redis Streams, and marks them published. A crash between commit and relay is harmless: the row is durable and will be relayed on recovery.

### Step 4: Write Idempotent Handlers in the Subscriber Module

Delivery is **at-least-once**: retries, relay recovery, and consumer-group rebalancing can all deliver the same event twice. Every handler must be idempotent — dedupe by event id, or make the effect naturally idempotent (upsert by a deterministic key).

Handlers live in the subscriber module's `events/` directory and are registered as providers; the core events module wires them to a Redis Streams consumer group.

**File:** `apps/api/src/modules/tasks/events/resolution-issued.handler.ts`

```typescript
// ✅ REQUIRED: one handler per file in events/, idempotent by construction
import { Injectable, Logger } from '@nestjs/common';
import {
  CORRESPONDENCE_EVENTS,
  TASK_EVENTS,
  ResolutionIssuedPayload,
  resolutionIssuedPayloadSchema,
} from '@nodus/contracts';
import { TransactionRunner } from '../../../core/database/transaction-runner';
import { EventBus } from '../../../core/events/event-bus';
import { EventEnvelope } from '../../../core/events/event-envelope';
import { TasksRepository } from '../tasks.repository';
import { ProcessedEventsRepository } from '../../../core/events/processed-events.repository';

@Injectable()
export class ResolutionIssuedHandler {
  // ✅ The core events module subscribes providers declaring `eventType` to the stream
  static readonly eventType = CORRESPONDENCE_EVENTS.RESOLUTION_ISSUED;

  private readonly logger = new Logger(ResolutionIssuedHandler.name);

  constructor(
    // ✅ Handlers never see the Prisma client — it lives only in repositories; transactions run via TransactionRunner
    private readonly txRunner: TransactionRunner,
    private readonly tasks: TasksRepository,
    private readonly processedEvents: ProcessedEventsRepository,
    private readonly eventBus: EventBus,
  ) {}

  async handle(envelope: EventEnvelope<ResolutionIssuedPayload>): Promise<void> {
    // ✅ Validate at the boundary — a malformed payload must not crash the consumer group
    const payload = resolutionIssuedPayloadSchema.parse(envelope.payload);

    await this.txRunner.run(async (tx) => {
      // ✅ Idempotency guard: first writer wins, replays become a no-op
      const firstDelivery = await this.processedEvents.tryMarkProcessed(
        tx,
        ResolutionIssuedHandler.name,
        envelope.id,
      );
      if (!firstDelivery) {
        this.logger.log(`Duplicate event ${envelope.id} — skipping`);
        return;
      }

      // ✅ Subscriber uses ONLY its own repository — never the publisher's tables (I3)
      const task = await this.tasks.createFromLetter(tx, {
        title: payload.directive,
        assigneeId: payload.assigneeId,
        creatorId: payload.actorId,
        deadline: payload.deadline,
        source: 'letter',
        sourceId: payload.letterId,
      });

      // ✅ Chained events go through the outbox too — in the same transaction
      await this.eventBus.emit(tx, TASK_EVENTS.CREATED, {
        taskId: task.id,
        title: task.title,
        assigneeId: task.assigneeId,
        creatorId: task.creatorId,
        source: 'letter',
        sourceId: payload.letterId,
      });
    });
  }
}
```

**File:** `apps/api/src/modules/tasks/tasks.module.ts`

```typescript
// ✅ REQUIRED: register handlers as providers of the subscribing module
import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TasksRepository } from './tasks.repository';
import { ResolutionIssuedHandler } from './events/resolution-issued.handler';

@Module({
  controllers: [TasksController],
  providers: [TasksService, TasksRepository, ResolutionIssuedHandler],
})
export class TasksModule {}
```

A second subscriber — e.g. notifications reacting to `task.created` — follows the same shape, with its own dedupe record:

**File:** `apps/api/src/modules/notifications/events/task-created.handler.ts`

```typescript
@Injectable()
export class TaskCreatedNotificationHandler {
  static readonly eventType = TASK_EVENTS.CREATED;

  constructor(
    // ✅ Handlers never see the Prisma client — it lives only in repositories; transactions run via TransactionRunner
    private readonly txRunner: TransactionRunner,
    private readonly processedEvents: ProcessedEventsRepository,
    private readonly eventBus: EventBus,
  ) {}

  async handle(envelope: EventEnvelope<TaskCreatedPayload>): Promise<void> {
    const payload = taskCreatedPayloadSchema.parse(envelope.payload);
    if (!payload.assigneeId) return;

    await this.txRunner.run(async (tx) => {
      const firstDelivery = await this.processedEvents.tryMarkProcessed(
        tx,
        TaskCreatedNotificationHandler.name,
        envelope.id,
      );
      if (!firstDelivery) return;

      // ✅ notification.dispatch_requested is the single entry point of the channel dispatcher
      await this.eventBus.emit(tx, NOTIFICATION_EVENTS.DISPATCH_REQUESTED, {
        recipientId: payload.assigneeId,
        template: 'task_assigned',
        context: { taskId: payload.taskId },
      });
    });
  }
}
```

### Step 5: What NOT to Install

```bash
# ❌ Do NOT install an in-process event emitter — it loses events on crash
#    and leaks cross-module calls past the outbox:
# pnpm add @nestjs/event-emitter
```

No package is needed: the `EventBus`, outbox relay, Redis Streams fanout, and processed-events dedupe store are provided by the core events module (`apps/api/src/core/events/`).

## Quick Reference Checklist

- [ ] No feature module imports another feature module's service/repository (I3, I6)
- [ ] Event name and payload schema are defined in `@nodus/contracts`
- [ ] Naming follows `module.action`, singular module prefix, past tense (`task.created`)
- [ ] Every `eventBus.emit(...)` receives the active transaction client `tx`
- [ ] No event is emitted after commit or outside `txRunner.run(...)`
- [ ] Payloads are minimal (id + key fields), validated with zod in the handler
- [ ] Every handler is idempotent (dedupe by event id or naturally idempotent effect)
- [ ] Handlers live in `events/` of the subscriber module and are registered as providers
- [ ] New events are appended to the catalog; existing names are never renamed/removed

**Incorrect:**

```typescript
// correspondence/correspondence.service.ts 🚨
@Injectable()
export class CorrespondenceService {
  constructor(
    private readonly tasksService: TasksService,   // ❌ Cross-module injection (I3/I6 violation)
    private readonly eventEmitter: EventEmitter2,  // ❌ In-memory emitter — forbidden
  ) {}

  async issueResolution(letterId: string, data: IssueResolutionDto, actorId: string) {
    const resolution = await this.prisma.resolution.create({ data: { letterId, ...data } }); // ❌ Prisma in service

    // ❌ Fire-and-forget: a crash after commit loses the event forever; not in the audit/event log (I9)
    this.eventEmitter.emit('resolution.issued', { resolutionId: resolution.id });

    // ❌ Emitting AFTER the transaction commits — rollback already impossible if publish fails
    await this.tasksService.create({ /* ... */ }); // ❌ Synchronous cascade; failure leaves half-state
    return resolution;
  }
}

// tasks/tasks.service.ts 🚨
@Injectable()
export class TasksService {
  @OnEvent('resolution.issued')        // ❌ EventEmitter2 decorator — not used in Nodus
  async onResolution(payload: any) {   // ❌ Untyped payload, no schema validation
    await this.prisma.task.create({ data: payload }); // ❌ No idempotency: retry creates duplicates
  }
}
```

**Correct:**

```typescript
// correspondence/correspondence.service.ts ✅
@Injectable()
export class CorrespondenceService {
  constructor(
    // ✅ Services never see the Prisma client — it lives only in repositories; transactions run via TransactionRunner
    private readonly txRunner: TransactionRunner,
    private readonly letters: LettersRepository,
    private readonly eventBus: EventBus,
  ) {}

  async issueResolution(letterId: string, data: IssueResolutionDto, actorId: string) {
    return this.txRunner.run(async (tx) => {
      const resolution = await this.letters.createResolution(tx, letterId, data, actorId);
      // ✅ Atomic: resolution row + outbox record commit together (I9)
      await this.eventBus.emit(tx, CORRESPONDENCE_EVENTS.RESOLUTION_ISSUED, {
        resolutionId: resolution.id,
        letterId,
        directive: data.directive,
        assigneeId: data.assigneeId,
        deadline: data.deadline,
        actorId,
      });
      return resolution;
    });
  }
}

// tasks/events/resolution-issued.handler.ts ✅ — see Step 4 for the full handler:
// schema-validated payload, dedupe by event id, own-repository writes,
// chained task.created emitted in the same transaction.
```

## Advanced: Saga Pattern for Multi-Step Workflows

Complex workflows are choreographed as chains of outbox events; each step is its own transaction with its own event. The letter → resolution → task → notification flow is a saga:

```
correspondence.resolution_issued ──▶ tasks handler: create task (tx + outbox)
task.created                     ──▶ notifications handler: dispatch_requested (tx + outbox)
notification.dispatch_requested  ──▶ channel dispatcher: send via web-push/email (tx + outbox)
```

Design rules for sagas:

- **Each step is atomic.** Never span a distributed transaction across modules; the outbox *is* the coordination mechanism.
- **Failures emit compensating events.** If a step cannot proceed, it emits a failure fact instead of throwing past its retry budget, so upstream steps can react:

```typescript
// ✅ Compensation: after retries are exhausted, emit a failure event the publisher can handle
await this.eventBus.emit(tx, TASK_EVENTS.CREATION_FAILED, {
  sourceEventId: envelope.id,
  source: 'letter',
  sourceId: payload.letterId,
  reason: 'ASSIGNEE_NOT_FOUND',
});
// A correspondence-module handler subscribes and flags the resolution for manual triage.
```

> `TASK_EVENTS.CREATION_FAILED` is a **new event** — before it can be emitted, it must first be added to the event catalog in `docs/architecture/api-conventions.md` (prefix = owning module in singular; the catalog only extends). Its payload schema lands in `packages/contracts` in the same change.

- **Correlate by ids.** Carry `sourceEventId` / `sourceId` through payloads so the whole chain is traceable in the `events` log (I9 doubles as the saga audit trail).

## Advanced: Delivery Semantics — Ordering, Retries, Poison Events

- **At-least-once, ordered per stream.** Redis Streams deliver in append order within a stream; consumer groups give each subscriber module its own cursor. Design handlers to tolerate replays (idempotency) rather than assuming exactly-once.
- **Retry with backoff.** A handler that throws is retried by the core consumer with exponential backoff. Transient failures (DB deadlock, Redis timeout) should just throw.
- **Poison events dead-letter.** After the retry budget is exhausted, the core consumer parks the event in a dead-letter list with the error and `traceId`, and processing continues. Alert on dead-letter growth; never let one bad event block the group.
- **Handler isolation.** Listeners of the same event run in independent consumer-group deliveries: a throwing notification handler must not prevent the search indexer from processing the same event.

```typescript
// ✅ Throw transient errors (retry), swallow nothing, log with context
async handle(envelope: EventEnvelope<TaskCreatedPayload>): Promise<void> {
  try {
    // ...idempotent work...
  } catch (error) {
    this.logger.error(`Handler failed for event ${envelope.id}`, error, {
      traceId: envelope.traceId,
    });
    throw error; // let the consumer retry / dead-letter — do not catch-and-ignore
  }
}
```

## Advanced: Event Versioning and the Append-Only Catalog

The event catalog only extends. Renaming or removing an event breaks every deployed subscriber and corrupts the historical `events` log (I9). Evolve events like this:

```typescript
// ✅ Additive change: new OPTIONAL field — old subscribers keep working (zod strips unknown keys,
//    and .optional() tolerates missing ones)
export const taskCreatedPayloadSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string(),
  assigneeId: z.string().uuid().nullable(),
  creatorId: z.string().uuid(),
  source: z.enum(['manual', 'chat_message', 'letter']),
  sourceId: z.string().uuid().nullable(),
  projectId: z.string().uuid().nullable().optional(), // ✅ added later, backwards compatible
});

// ✅ Breaking change: introduce a NEW event name; keep publishing/consuming the old one
//    during the migration window
export const TASK_EVENTS = {
  CREATED: 'task.created',
  ASSIGNED: 'task.assigned',           // new event instead of mutating task.created semantics
} as const;
```

```typescript
// ❌ WRONG - versioning by renaming (breaks subscribers and history)
'resolution.issued.v2'              // ad-hoc rename of an existing event
taskCreatedPayloadSchema.required() // tightening a field — old payloads stop validating
```

Because every event is persisted in the `events` table, replaying history for a new projection (e.g. building a search index) is a supported operation: read the log in `createdAt` order and feed it through the new handler.

## Advanced: WebSocket Fanout Uses the Same Catalog

The ws-gateway re-broadcasts domain events to browsers **with the same names** — there is no separate WS catalog. The envelope is `{ type, payload, seq, ts }`; clients store `seq` and fetch missed events after reconnect:

```typescript
// Server → client message (ws-gateway, core-owned)
{
  type: 'task.created',
  payload: { taskId: '…', title: '…', assigneeId: '…', creatorId: '…', source: 'letter', sourceId: '…' },
  seq: 10234,
  ts: '2025-01-15T09:30:00.000Z',
}
```

Implication for backend design: event payloads are client-visible. Keep secrets and internal-only fields out of payloads; publish internal facts as separate server-only events if needed.

## Testing Event-Driven Code

Unit tests mock the repository, the EventBus, and the TransactionRunner (pass-through); integration tests verify outbox and idempotency against a real test database (see `docs/architecture/patterns.md`).

**File:** `apps/api/src/modules/correspondence/correspondence.service.test.ts`

```typescript
// ✅ Unit test (Vitest): event is emitted inside the transaction with the contracted payload
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CORRESPONDENCE_EVENTS } from '@nodus/contracts';
import { CorrespondenceService } from './correspondence.service';

describe('CorrespondenceService.issueResolution', () => {
  const letters = {
    findById: vi.fn(),
    createResolution: vi.fn(),
  };
  const eventBus = { emit: vi.fn() };
  // Pass the tx client straight through so assertions can inspect it
  const txRunner = {
    run: vi.fn((cb: (tx: unknown) => unknown) => cb('TX_CLIENT')),
  };

  let service: CorrespondenceService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CorrespondenceService(txRunner as never, letters as never, eventBus as never);
  });

  it('emits correspondence.resolution_issued in the same transaction', async () => {
    letters.findById.mockResolvedValue({ id: 'letter-1' });
    letters.createResolution.mockResolvedValue({ id: 'resolution-1' });

    await service.issueResolution(
      'letter-1',
      { directive: 'Prepare estimate', assigneeId: 'user-1', deadline: null },
      'actor-1',
    );

    expect(letters.createResolution).toHaveBeenCalledWith(
      'TX_CLIENT', 'letter-1', expect.anything(), 'actor-1',
    );
    expect(eventBus.emit).toHaveBeenCalledWith(
      'TX_CLIENT', // ✅ same transaction client — proves outbox atomicity
      CORRESPONDENCE_EVENTS.RESOLUTION_ISSUED,
      expect.objectContaining({ resolutionId: 'resolution-1', letterId: 'letter-1' }),
    );
  });

  it('does not emit when the letter does not exist', async () => {
    letters.findById.mockResolvedValue(null);

    await expect(
      service.issueResolution('missing', { directive: 'x' } as never, 'actor-1'),
    ).rejects.toThrow();
    expect(eventBus.emit).not.toHaveBeenCalled();
  });
});
```

**File:** `apps/api/src/modules/tasks/events/resolution-issued.handler.test.ts`

```typescript
// ✅ Idempotency is a tested behavior, not a convention
import { describe, expect, it, vi } from 'vitest';
import { ResolutionIssuedHandler } from './resolution-issued.handler';

it('applies a duplicated event exactly once', async () => {
  const processedEvents = { tryMarkProcessed: vi.fn() };
  const tasks = { createFromLetter: vi.fn().mockResolvedValue({ id: 'task-1' }) };
  const eventBus = { emit: vi.fn() };
  const txRunner = { run: vi.fn((cb: (tx: unknown) => unknown) => cb('TX')) };

  const handler = new ResolutionIssuedHandler(
    txRunner as never, tasks as never, processedEvents as never, eventBus as never,
  );
  const envelope = {
    id: 'evt-1',
    type: 'correspondence.resolution_issued',
    payload: {
      resolutionId: '11111111-1111-4111-8111-111111111111',
      letterId: '22222222-2222-4222-8222-222222222222',
      directive: 'Prepare estimate',
      assigneeId: '33333333-3333-4333-8333-333333333333',
      deadline: null,
      actorId: '44444444-4444-4444-8444-444444444444',
    },
    traceId: 'trace-1',
  };

  processedEvents.tryMarkProcessed.mockResolvedValueOnce(true);   // first delivery
  await handler.handle(envelope as never);
  processedEvents.tryMarkProcessed.mockResolvedValueOnce(false);  // replay
  await handler.handle(envelope as never);

  expect(tasks.createFromLetter).toHaveBeenCalledTimes(1); // ✅ no duplicate task
  expect(eventBus.emit).toHaveBeenCalledTimes(1);
});
```

Integration tests (real test DB, no mocks) must cover: outbox row written in the same transaction as the state change; relay publishes to Redis Streams; handler replay safety on redelivered events.

## Best Practices Summary

| Practice | Why |
|----------|-----|
| Events instead of cross-module injection | Loose coupling; ESLint-boundaries enforce it (I3, I6) |
| Outbox write in the same transaction | State change and event commit or roll back together (I9) |
| Contracts own names and payload schemas | Publisher and all subscribers share one source of truth |
| Minimal payloads (id + key fields) | Events are facts; details are read via the owner's API |
| Idempotent handlers with dedupe | At-least-once delivery makes replays normal, not exceptional |
| Handlers in subscriber's `events/` dir | One file = one responsibility; wiring stays in the module |
| Append-only event catalog | Renames/removals break subscribers and the event log |
| Saga = chain of transactional steps + compensating events | Each step atomic; whole chain traceable in the event log |
| Vitest unit tests for emit and idempotency | Outbox atomicity and replay safety are verifiable behaviors |

**Sources:**
- `docs/architecture/invariants.md` (I3, I6, I9) and `docs/architecture/patterns.md` (EventBus usage, handler placement)
- `docs/architecture/api-conventions.md` (event catalog, naming rules, WS envelope)
