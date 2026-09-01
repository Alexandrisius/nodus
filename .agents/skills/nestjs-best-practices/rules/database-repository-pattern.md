---
title: Use Repository Pattern for Database Logic Encapsulation
impact: HIGH
impactDescription: Separates concerns and improves testability
section: 6
tags: database, repository, prisma, encapsulation, clean-architecture
---

Placing database query logic directly in services leads to bloated service classes, mixing business logic with data access, and difficult testing. In Nodus this boundary is **mandatory, not optional**: Prisma is called only inside the module's `*.repository.ts` (and in `infra/`). Services never see the Prisma client — they talk to the repository through methods named in the domain language (`findOverdueByAssignee`, not `findMany({ where: ... }`).

This gives you:

- **One data-access point per module** — the single place for indexes, soft-delete filters, cursor pagination and query tuning.
- **Testability** — service unit tests mock the repository interface, no database needed.
- **Module isolation (I3/I6)** — a repository touches only its own module's tables; other modules' data comes via events or contracts.
- **Atomic outbox (I9)** — repository methods accept a transaction client so the domain-event insert commits in the same transaction as the entity change.

## For AI Agents

When implementing or reviewing database operations, **always** follow these steps:

### Step 1: Check for Database Logic in Services
**Pattern to check:** Look for `PrismaService` injected into a service/controller, Prisma model calls (`this.prisma.task.findMany`, `.create`, `.update`), or raw SQL anywhere outside `*.repository.ts`.

```typescript
// ❌ WRONG - Database logic in service
@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {} // ❌ Prisma client in service

  async getTasks(assigneeId: string, filterDto: GetTasksFilterDto) {
    // ❌ Query composition in service
    return this.prisma.task.findMany({
      where: {
        assigneeId,
        ...(filterDto.stageId ? { stageId: filterDto.stageId } : {}),
        ...(filterDto.search
          ? {
              OR: [
                { title: { contains: filterDto.search, mode: 'insensitive' } },
                { description: { contains: filterDto.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
    });
  }

  async findOverdue(assigneeId: string) {
    // ❌ Complex query in service - hard to test, invisible to DB tuning
    return this.prisma.task.findMany({
      where: {
        assigneeId,
        dueAt: { lt: new Date() },
        completedAt: null,
      },
      orderBy: { dueAt: 'asc' },
    });
  }
}
```

**If found:** Extract to the module repository with a domain-named method.

### Step 2: Know the Schema the Repository Wraps
**File:** `apps/api/prisma/schema.prisma` (relevant excerpt)

```prisma
model Task {
  id          String          @id @default(uuid())
  projectId   String          @map("project_id")
  title       String
  description String?
  status      TaskSystemState @default(backlog) // system state — enum mirrored from @nodus/contracts
  stageId     String          @map("stage_id")    // → WorkflowStage row (data): the user-visible "status"
  priorityId  String?         @map("priority_id") // → DictionaryItem row (data, I15)
  assigneeId  String          @map("assignee_id")
  dueAt       DateTime?       @map("due_at")
  completedAt DateTime?       @map("completed_at") // set when the system state reaches done
  overdueAt   DateTime?       @map("overdue_at")   // set by the workflow engine when dueAt passes
  createdAt   DateTime        @default(now()) @map("created_at")
  updatedAt   DateTime        @updatedAt @map("updated_at")

  stage       WorkflowStage   @relation(fields: [stageId], references: [id])
  priority    DictionaryItem? @relation(fields: [priorityId], references: [id])
  assignee    User            @relation(fields: [assigneeId], references: [id])

  @@index([assigneeId, createdAt, id])
  @@index([assigneeId, dueAt])
  @@map("tasks")
}

enum TaskSystemState { // system state machine — the same enum lives in @nodus/contracts
  backlog
  active
  paused
  done
  closed
}

model Event { // transactional outbox (I9) — append-only
  id            String    @id @default(uuid())
  type          String    // e.g. 'task.created' — catalog in @nodus/contracts
  actorId       String?   @map("actor_id")
  aggregateType String    @map("aggregate_type") // e.g. 'task'
  aggregateId   String    @map("aggregate_id")
  payload       Json
  createdAt     DateTime  @default(now()) @map("created_at")
  publishedAt   DateTime? @map("published_at") // NULL until fanned out after commit

  @@map("events")
}
```

Note the status modeling: `status` is the **system state** (`TaskSystemState`, an enum in `@nodus/contracts`) — hidden from users and moved only by workflow transitions. What users call "status" is the **stage** — a `WorkflowStage` row referenced by `stageId` (data). Priority is a `DictionaryItem` row (I15). There is no `statusId → Dictionary` relation and no business-status enum in code. Enums exist only for system constants in `@nodus/contracts` (error codes, event types, system states).

### Step 3: Create the Module Repository
**File:** `tasks/tasks.repository.ts`

```typescript
// ✅ REQUIRED: repository = the module's only Prisma gateway
import { Injectable } from '@nestjs/common';
import { Prisma, Task, TaskSystemState } from '@prisma/client';
import { PrismaService } from '../../infra/prisma.service';

export interface TaskPageFilter {
  stageId?: string;
  search?: string;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

// Default page size and hard cap come from api-conventions (?cursor=&limit=, ≤ 100, default 50)
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

@Injectable()
export class TasksRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cursor-paginated tasks of an assignee. Sort is deterministic:
   * createdAt DESC + id tiebreaker — the cursor is stable across pages.
   */
  async findPageByAssignee(
    assigneeId: string,
    filter: TaskPageFilter,
    cursor?: string,
    limit = DEFAULT_LIMIT,
  ): Promise<CursorPage<Task>> {
    const take = Math.min(limit, MAX_LIMIT);

    const where: Prisma.TaskWhereInput = {
      assigneeId,
      ...(filter.stageId ? { stageId: filter.stageId } : {}),
      ...(filter.search
        ? {
            OR: [
              { title: { contains: filter.search, mode: 'insensitive' } },
              { description: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    // Fetch one extra row to know whether another page exists
    const rows = await this.prisma.task.findMany({
      where,
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  /** Single task by id, scoped to the module's own table. */
  async findById(id: string): Promise<Task | null> {
    return this.prisma.task.findUnique({ where: { id } });
  }

  /** Overdue open tasks of an assignee — domain language, not query language. */
  async findOverdueByAssignee(assigneeId: string, now = new Date()): Promise<Task[]> {
    return this.prisma.task.findMany({
      where: {
        assigneeId,
        dueAt: { lt: now },
        completedAt: null,
      },
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
    });
  }
}
```

### Step 4: Register Repository in Module
**File:** `tasks/tasks.module.ts`

```typescript
// ✅ REQUIRED: repository is a provider of the feature module
import { Module } from '@nestjs/common';
import { InfraModule } from '../../infra/infra.module'; // exports PrismaService
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TasksRepository } from './tasks.repository';

@Module({
  imports: [InfraModule],
  controllers: [TasksController],
  providers: [TasksService, TasksRepository],
  // ❌ Do NOT export providers — other modules must not query our tables or
  // call our internals (I3/I6). They consume events or integrate via contracts.
})
export class TasksModule {}
```

### Step 5: Inject Repository in Service
**File:** `tasks/tasks.service.ts`

```typescript
// ✅ REQUIRED: clean service — business rules only, no Prisma
import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@nodus/contracts';
import { TasksRepository, TaskPageFilter, CursorPage } from './tasks.repository';
import { Task } from '@prisma/client';
import { DomainException } from '../../core/errors/domain-exception';

@Injectable()
export class TasksService {
  constructor(private readonly tasksRepository: TasksRepository) {}

  async getTasksPage(
    assigneeId: string,
    filter: TaskPageFilter,
    cursor?: string,
    limit?: number,
  ): Promise<CursorPage<Task>> {
    // ✅ Delegates to repository — query shape lives in one place
    return this.tasksRepository.findPageByAssignee(assigneeId, filter, cursor, limit);
  }

  async getById(id: string): Promise<Task> {
    const task = await this.tasksRepository.findById(id);
    if (!task) {
      // Domain exception with a code from @nodus/contracts — the global
      // exception filter (core) maps it to the HTTP error format
      throw new DomainException(ErrorCode.NOT_FOUND, 'Task not found');
    }
    return task;
  }

  async getOverdue(assigneeId: string): Promise<Task[]> {
    return this.tasksRepository.findOverdueByAssignee(assigneeId);
  }
}
```

### Step 6: Mutations — Transaction + Outbox Event
Every entity change must write its domain event into the `events` outbox table **in the same database transaction** (I9). The service orchestrates the transaction through the core transaction runner and core EventBus; the repository executes the writes with the passed transaction client:

```typescript
// ✅ REQUIRED: repository methods accept an optional transaction client
// tasks/tasks.repository.ts
import { Prisma } from '@prisma/client';

@Injectable()
export class TasksRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: Prisma.TaskUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<Task> {
    const client = tx ?? this.prisma;
    return client.task.create({ data });
  }

  async update(
    id: string,
    data: Prisma.TaskUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<Task> {
    const client = tx ?? this.prisma;
    return client.task.update({ where: { id }, data });
  }

  async markCompleted(id: string, completedAt: Date, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.task.update({
      where: { id },
      data: { completedAt },
    });
  }
}
```

```typescript
// ✅ REQUIRED: service orchestrates tx + outbox via core primitives
// tasks/tasks.service.ts
import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../core/database/transaction-runner'; // wraps prisma.$transaction
import { EventBus } from '../../core/events/event-bus';                     // outbox writer (I9)
import { TasksRepository } from './tasks.repository';
import { CreateTaskDto } from './dto/create-task.dto'; // inferred from zod schema in @nodus/contracts

@Injectable()
export class TasksService {
  constructor(
    private readonly tasksRepository: TasksRepository,
    private readonly tx: TransactionRunner,
    private readonly eventBus: EventBus,
  ) {}

  async createTask(dto: CreateTaskDto, assigneeId: string) {
    return this.tx.run(async (tx) => {
      const task = await this.tasksRepository.create(
        {
          title: dto.title,
          description: dto.description,
          projectId: dto.projectId,
          assigneeId,
          stageId: dto.stageId,       // → WorkflowStage row (data) — validated by zod + FK
          priorityId: dto.priorityId, // → DictionaryItem row (I15)
          // status is the system state — it derives from the stage, not from client input
          dueAt: dto.dueAt,
        },
        tx,
      );

      // Outbox insert uses the SAME tx — entity + event commit atomically.
      // Fanout to Redis Streams happens after commit, inside the EventBus.
      await this.eventBus.emit(tx, 'task.created', {
        taskId: task.id,
        projectId: task.projectId,
        assigneeId: task.assigneeId,
      });

      return task;
    });
  }

  async completeTask(id: string) {
    const task = await this.getById(id);

    if (task.completedAt) {
      // Idempotent re-completion: return current state instead of failing
      return task;
    }

    return this.tx.run(async (tx) => {
      const completed = await this.tasksRepository.markCompleted(id, new Date(), tx);
      await this.eventBus.emit(tx, 'task.completed', {
        taskId: id,
        assigneeId: task.assigneeId,
      });
      return completed;
    });
  }
}
```

**Rules enforced by this shape:**

- `Prisma.TransactionClient` is the only Prisma type services ever *reference* (as an opaque handle); they never call Prisma query methods.
- The outbox insert is impossible to forget in review: it sits next to the write, inside the same callback. Publishing an event outside this path (direct Redis publish, in-process emitter) is a violation.
- Event names come from the catalog in `@nodus/contracts` (`module.action`, e.g. `task.created`) — never ad-hoc strings invented mid-feature.

### Step 7: Add Complex Query Methods to the Repository

```typescript
// ✅ Aggregations and joins live in the repository, shaped for the use case
// tasks/tasks.repository.ts

/** Open-task counts grouped by system state for the assignee's dashboard. */
async getStatsByStatus(assigneeId: string): Promise<{ status: TaskSystemState; count: number }[]> {
  const grouped = await this.prisma.task.groupBy({
    by: ['status'],
    where: { assigneeId, completedAt: null },
    _count: { _all: true },
  });

  return grouped.map((row) => ({ status: row.status, count: row._count._all }));
}

/** Workload report: open tasks + logged minutes per task for an assignee. */
async getWorkloadByAssignee(assigneeId: string) {
  return this.prisma.$queryRaw<
    { task_id: string; title: string; due_at: Date | null; logged_minutes: bigint }[]
  >`
    SELECT
      t.id AS task_id,
      t.title,
      t.due_at,
      COALESCE(SUM(te.minutes), 0) AS logged_minutes
    FROM tasks t
    LEFT JOIN time_entries te ON te.task_id = t.id
    WHERE t.assignee_id = ${assigneeId}
      AND t.completed_at IS NULL
    GROUP BY t.id, t.title, t.due_at
    ORDER BY t.due_at ASC NULLS LAST
  `;
}

/** Batch status change (e.g. workflow engine marking overdue) — single statement. */
async markOverdue(now = new Date()): Promise<string[]> {
  const rows = await this.prisma.task.findMany({
    where: { dueAt: { lt: now }, completedAt: null, overdueAt: null },
    select: { id: true },
  });

  if (rows.length === 0) return [];

  await this.prisma.task.updateMany({
    where: { id: { in: rows.map((r) => r.id) } },
    data: { overdueAt: now },
  });

  return rows.map((r) => r.id);
}
```

### Step 8: Testing — Mock the Repository, Not Prisma

Service unit tests (Vitest, next to the code) mock the repository's domain interface. No Prisma mock, no database:

```typescript
// ✅ REQUIRED: service test with a mocked repository
// tasks/tasks.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TasksService } from './tasks.service';
import { TasksRepository } from './tasks.repository';
import { DomainException } from '../../core/errors/domain-exception';

describe('TasksService', () => {
  let service: TasksService;

  const tasksRepository = {
    findById: vi.fn(),
    findPageByAssignee: vi.fn(),
    findOverdueByAssignee: vi.fn(),
    create: vi.fn(),
    markCompleted: vi.fn(),
  };

  const tx = {
    run: vi.fn((cb: (tx: unknown) => unknown) => cb('tx-handle')),
  };

  const eventBus = {
    emit: vi.fn(),
  };

  const openTask = {
    id: 'task-1',
    title: 'Проверить КЖ',
    status: 'active',
    stageId: 'stage-in-work',
    priorityId: 'priority-normal',
    assigneeId: 'user-1',
    projectId: 'project-1',
    completedAt: null,
    dueAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TasksService(
      tasksRepository as unknown as TasksRepository,
      tx as never,
      eventBus as never,
    );
  });

  describe('getById', () => {
    it('returns the task when it exists', async () => {
      tasksRepository.findById.mockResolvedValue(openTask);

      await expect(service.getById('task-1')).resolves.toEqual(openTask);
      expect(tasksRepository.findById).toHaveBeenCalledWith('task-1');
    });

    it('throws a domain exception when the task is missing', async () => {
      tasksRepository.findById.mockResolvedValue(null);

      await expect(service.getById('missing')).rejects.toBeInstanceOf(
        DomainException,
      );
    });
  });

  describe('completeTask', () => {
    it('writes the event in the same transaction as the update', async () => {
      tasksRepository.findById.mockResolvedValue(openTask);
      tasksRepository.markCompleted.mockResolvedValue({ ...openTask, completedAt: new Date() });

      await service.completeTask('task-1');

      expect(tx.run).toHaveBeenCalledOnce();
      expect(tasksRepository.markCompleted).toHaveBeenCalledWith(
        'task-1',
        expect.any(Date),
        'tx-handle', // same tx handle the event bus receives
      );
      expect(eventBus.emit).toHaveBeenCalledWith('tx-handle', 'task.completed', {
        taskId: 'task-1',
        assigneeId: 'user-1',
      });
    });

    it('is idempotent: re-completing returns the task without a new event', async () => {
      tasksRepository.findById.mockResolvedValue({ ...openTask, completedAt: new Date() });

      await service.completeTask('task-1');

      expect(tasksRepository.markCompleted).not.toHaveBeenCalled();
      expect(eventBus.emit).not.toHaveBeenCalled();
    });
  });
});
```

Repository tests are **integration tests against a real test database** (docker), not Prisma mocks — mocking Prisma only verifies your mock. They live outside the blocking unit-test run:

```typescript
// ✅ OPTIONAL: repository integration test (test DB from docker-compose.test)
// tasks/tasks.repository.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaService } from '../../infra/prisma.service';
import { TasksRepository } from './tasks.repository';

describe('TasksRepository (integration)', () => {
  let prisma: PrismaService;
  let repository: TasksRepository;

  beforeAll(async () => {
    // The integration run sets DATABASE_URL to the disposable test DB
    // (docker-compose test profile) before PrismaService is constructed
    prisma = new PrismaService();
    repository = new TasksRepository(prisma);
    // seed: user, project, workflow stages, dictionary items, tasks
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('findOverdueByAssignee returns only overdue open tasks, ordered by dueAt', async () => {
    const overdue = await repository.findOverdueByAssignee('seed-user-1');

    expect(overdue.map((t) => t.id)).toEqual(['seed-task-2', 'seed-task-1']);
    expect(overdue.every((t) => t.completedAt === null)).toBe(true);
  });

  it('findPageByAssignee paginates with a stable cursor', async () => {
    const page1 = await repository.findPageByAssignee('seed-user-1', {}, undefined, 2);
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await repository.findPageByAssignee('seed-user-1', {}, page1.nextCursor!, 2);
    const ids1 = new Set(page1.items.map((t) => t.id));
    expect(page2.items.every((t) => !ids1.has(t.id))).toBe(true); // no overlap
  });
});
```

**Incorrect:**

```typescript
// tasks/tasks.service.ts - Prisma in service 🚨
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {} // ❌ service knows Prisma

  async getTasks(assigneeId: string, filterDto: GetTasksFilterDto) {
    // ❌ Query composition in the service — untestable without a DB
    return this.prisma.task.findMany({
      where: {
        assigneeId,
        stageId: filterDto.stageId,
        OR: filterDto.search
          ? [{ title: { contains: filterDto.search } }]
          : undefined,
      },
      take: 1000, // ❌ unbounded list — must be cursor-paginated ≤ 100
    });
  }

  async createTask(dto: CreateTaskDto, assigneeId: string) {
    // ❌ Workflow stage as a hardcoded id instead of a validated data reference (I15)
    const task = await this.prisma.task.create({
      data: { ...dto, assigneeId, stageId: 'stage-in-work' },
    });

    // ❌ Event published separately from the write — not atomic (I9 broken),
    //    and bypasses the outbox entirely
    await this.redis.publish('events', JSON.stringify({ type: 'task.created', taskId: task.id }));

    return task;
  }

  async findOverdue(assigneeId: string) {
    // ❌ Same filter re-implemented in every consumer; index changes
    //    require hunting through services
    return this.prisma.task.findMany({
      where: { assigneeId, dueAt: { lt: new Date() }, completedAt: null },
    });
  }
}

// chat/chat.service.ts - Cross-module table access 🚨
@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  async getTaskTitleForMessage(taskId: string) {
    // ❌ Chat module queries the tasks module's table directly (I3/I6 broken)
    return this.prisma.task.findUnique({ where: { id: taskId } });
  }
}
```

**Correct:**

```typescript
// tasks/tasks.repository.ts - Encapsulated data access ✅
import { Injectable } from '@nestjs/common';
import { Prisma, Task, TaskSystemState } from '@prisma/client';
import { PrismaService } from '../../infra/prisma.service';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

@Injectable()
export class TasksRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Cursor page of an assignee's tasks; deterministic sort keeps the cursor stable. */
  async findPageByAssignee(
    assigneeId: string,
    filter: { stageId?: string; search?: string },
    cursor?: string,
    limit = DEFAULT_LIMIT,
  ) {
    const take = Math.min(limit, MAX_LIMIT);
    const rows = await this.prisma.task.findMany({
      where: {
        assigneeId,
        ...(filter.stageId ? { stageId: filter.stageId } : {}),
        ...(filter.search
          ? {
              OR: [
                { title: { contains: filter.search, mode: 'insensitive' } },
                { description: { contains: filter.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  }

  /** Single task by id. */
  async findById(id: string): Promise<Task | null> {
    return this.prisma.task.findUnique({ where: { id } });
  }

  /** Open tasks past their due date for one assignee. */
  async findOverdueByAssignee(assigneeId: string, now = new Date()): Promise<Task[]> {
    return this.prisma.task.findMany({
      where: { assigneeId, dueAt: { lt: now }, completedAt: null },
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
    });
  }

  /** Create inside an optional ambient transaction (outbox pattern). */
  async create(data: Prisma.TaskUncheckedCreateInput, tx?: Prisma.TransactionClient) {
    return (tx ?? this.prisma).task.create({ data });
  }

  /** Update arbitrary fields inside an optional ambient transaction. */
  async update(id: string, data: Prisma.TaskUncheckedUpdateInput, tx?: Prisma.TransactionClient) {
    return (tx ?? this.prisma).task.update({ where: { id }, data });
  }

  /** Mark completed inside an optional ambient transaction. */
  async markCompleted(id: string, completedAt: Date, tx?: Prisma.TransactionClient) {
    return (tx ?? this.prisma).task.update({
      where: { id },
      data: { completedAt },
    });
  }

  /** Open-task counts per system state for dashboards. */
  async getStatsByStatus(assigneeId: string) {
    const grouped = await this.prisma.task.groupBy({
      by: ['status'],
      where: { assigneeId, completedAt: null },
      _count: { _all: true },
    });
    return grouped.map((row) => ({ status: row.status, count: row._count._all }));
  }
}

// tasks/tasks.service.ts - Clean business logic ✅
import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@nodus/contracts';
import { TransactionRunner } from '../../core/database/transaction-runner';
import { EventBus } from '../../core/events/event-bus';
import { TasksRepository } from './tasks.repository';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { DomainException } from '../../core/errors/domain-exception';

@Injectable()
export class TasksService {
  constructor(
    private readonly tasksRepository: TasksRepository,
    private readonly tx: TransactionRunner,
    private readonly eventBus: EventBus,
  ) {}

  async getTasksPage(assigneeId: string, filter: { stageId?: string; search?: string }, cursor?: string, limit?: number) {
    return this.tasksRepository.findPageByAssignee(assigneeId, filter, cursor, limit);
  }

  async getById(id: string) {
    const task = await this.tasksRepository.findById(id);
    if (!task) throw new DomainException(ErrorCode.NOT_FOUND, 'Task not found');
    return task;
  }

  async createTask(dto: CreateTaskDto, assigneeId: string) {
    return this.tx.run(async (tx) => {
      const task = await this.tasksRepository.create({ ...dto, assigneeId }, tx);
      await this.eventBus.emit(tx, 'task.created', {
        taskId: task.id,
        projectId: task.projectId,
        assigneeId: task.assigneeId,
      });
      return task;
    });
  }

  async updateTask(id: string, dto: UpdateTaskDto) {
    const before = await this.getById(id);

    return this.tx.run(async (tx) => {
      const task = await this.tasksRepository.update(id, dto, tx);
      await this.eventBus.emit(tx, 'task.updated', {
        taskId: id,
        changedFields: Object.keys(dto),
        // payload stays minimal — subscribers read details via API
      });

      if (before.stageId !== task.stageId) {
        await this.eventBus.emit(tx, 'task.stage_changed', {
          taskId: id,
          fromStageId: before.stageId,
          toStageId: task.stageId,
        });
      }

      return task;
    });
  }

  async completeTask(id: string) {
    const task = await this.getById(id);
    if (task.completedAt) return task; // idempotent

    return this.tx.run(async (tx) => {
      const completed = await this.tasksRepository.markCompleted(id, new Date(), tx);
      await this.eventBus.emit(tx, 'task.completed', {
        taskId: id,
        assigneeId: task.assigneeId,
      });
      return completed;
    });
  }

  async getOverdue(assigneeId: string) {
    return this.tasksRepository.findOverdueByAssignee(assigneeId);
  }
}

// tasks/tasks.module.ts - Proper registration ✅
import { Module } from '@nestjs/common';
import { InfraModule } from '../../infra/infra.module';
import { CoreModule } from '../../core/core.module'; // TransactionRunner, EventBus
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TasksRepository } from './tasks.repository';

@Module({
  imports: [InfraModule, CoreModule],
  controllers: [TasksController],
  providers: [TasksService, TasksRepository],
  // ✅ No exports: providers are module-private — other modules consume
  // events or integrate via @nodus/contracts (I3/I6)
})
export class TasksModule {}
```

## Soft Deletes and Module Conventions

- Prefer `deletedAt`/`archivedAt` timestamps over physical deletes for domain entities; encode the filter **inside the repository** (`where: { deletedAt: null }`) so no consumer can accidentally read archived rows.
- Dictionary entries (I15) are never hard-deleted — they are archived; repositories filter `archivedAt: null` on reads but keep accepting existing ids for historical rows.
- One repository per aggregate root (`tasks.repository.ts`, `time-entries.repository.ts`), not per endpoint and not one mega-repository per module.

## Best Practices Summary

| Practice | Why |
|----------|-----|
| Prisma only in `*.repository.ts` | Single data-access point; services stay testable |
| Domain-named methods (`findOverdueByAssignee`) | Call sites read as business language; query evolves in one place |
| Never export the repository from the module | Other modules go through events/contracts (I3/I6) |
| Cursor pagination inside the repository | Uniform `?cursor=&limit=` contract, bounded result sets |
| Deterministic sort (`createdAt` + `id`) | Stable cursors, no skipped/duplicated rows between pages |
| `tx?: Prisma.TransactionClient` on write methods | Outbox event commits atomically with the entity (I9) |
| Stage/priority as data ids, system state as a contracts enum | I15: business lists live in data; `TaskSystemState` is a system constant |
| Mock repositories in service tests | Fast unit tests without a database |
| Integration-test repositories on a real DB | Only a real database validates the actual SQL |
