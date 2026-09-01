---
title: Store Business Lists in Dictionaries; Reserve Enums for System Constants
impact: HIGH
impactDescription: Keeps business vocabularies admin-editable without deploys and system constants type-safe
section: 3
tags: architecture, dictionaries, type-safety, contracts, i15
---

Hard-coding business statuses and lists (task stages, priorities, work types, letter categories) as TypeScript enums forces a deploy for every vocabulary change and breaks stored data on rename. Business vocabularies are **data owned by admins** — they live in the `dictionaries` / `WorkflowStage` tables and are referenced by ID. System constants (task system state, error codes, event names, permissions) are **fixed by the platform** — they live as enums in `@nodus/contracts`. **Never create enums for business lists (I15); never scatter system constants as string literals.**

## For AI Agents

When implementing or reviewing any fixed set of values, **always** follow these steps:

### Step 1: Classify the Value Set

Before writing a single value, decide where the set belongs. Ask: *who owns this list — admins or the platform?*

| Question | Business list → `dictionaries` | System constant → enum in contracts |
|---|---|---|
| Who defines valid values | Portal admins, per organization | Platform developers |
| Change frequency | Anytime, no deploy | Only with a release |
| Stored in DB as | Reference ID (`stage_id`, `priority_id`) | String value (`status = 'active'`) |
| "Deletion" | Archive the item (never hard-delete, I15) | Remove only in a release (never for events/error codes) |
| Display name | Data (managed via admin UI) | i18n key in `packages/contracts/i18n/ru.ts` |
| Examples | Task stage, priority, work type, letter category, project type | Task system state, error codes, event names, permission keys |

```typescript
// ❌ WRONG - Business list hard-coded as an enum
export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}
// Tomorrow an admin adds "Critical" → code change + deploy + data migration. Violates I15.

// ❌ WRONG - String literals for anything (business or system)
async changeStage(taskId: string, stage: string) {
  if (stage === 'in progres') { /* typo ships to production */ }
}

// ❌ WRONG - Inconsistent casing, no single source
task.priority = 'HIGH';
task.priority = 'high';
task.priority = 'High';
```

**If found:** business list → dictionary reference by ID; system constant → enum in `@nodus/contracts`.

### Step 2: Model Business Lists as Dictionaries

**File:** `apps/api/prisma/schema.prisma` (core-owned tables; shown for reference)

```prisma
// Business vocabularies: admin-managed, referenced by ID, archived — never deleted (I15)
model Dictionary {
  id             String           @id @default(uuid())
  code           String           @unique // snake_case code: 'task_priority', 'work_type', 'letter_category'
  name           String                     // display name (data, not i18n)
  isHierarchical Boolean          @default(false)
  editPolicy     String                     // who may edit: 'admin' | 'gip' | ...
  items          DictionaryItem[]
}

model DictionaryItem {
  id           String     @id @default(uuid())
  dictionaryId String
  dictionary   Dictionary @relation(fields: [dictionaryId], references: [id])
  parentId     String?                    // set only for hierarchical dictionaries
  name         String                     // display name shown in UI
  code         String?                    // optional stable code for integrations
  sortOrder    Int        @default(0)
  archivedAt   DateTime?                  // archive instead of delete (I15)

  @@index([dictionaryId, sortOrder])
}
```

Entity columns reference items **by ID**, never by name or code:

```prisma
model Task {
  id         String  @id @default(uuid())
  title      String
  // ✅ System constant stored as a string; valid values enforced by the contracts enum (Step 3)
  status     String  @default("backlog") // TaskSystemState: backlog|active|paused|done|closed
  // ✅ Business list: FK to WorkflowStage (kanban column, admin-managed)
  stageId    String?
  stage      WorkflowStage? @relation(fields: [stageId], references: [id])
  // ✅ Business list: FK to a DictionaryItem of dictionary 'task_priority'
  priorityId String?
  priority   DictionaryItem? @relation(fields: [priorityId], references: [id])
}

model WorkflowScheme {
  id     String @id @default(uuid())
  code   String @unique
  name   String
  stages WorkflowStage[]
}

model WorkflowStage {
  id          String  @id @default(uuid())
  schemeId    String
  scheme      WorkflowScheme @relation(fields: [schemeId], references: [id])
  name        String  // kanban column title (data, admin-managed)
  sortOrder   Int
  systemState String  // ✅ maps business stage → TaskSystemState (contracts enum)
  // transition rights / automations are data too — JSON or relation tables, not code
}
```

### Step 3: Put System Constants in `@nodus/contracts`

**File:** `packages/contracts/src/task/task-system-state.ts`

```typescript
// ✅ REQUIRED: System constants are enums — shared by api, web, and ws-gateway
export enum TaskSystemState {
  BACKLOG = 'backlog',
  ACTIVE = 'active',
  PAUSED = 'paused',
  DONE = 'done',
  CLOSED = 'closed',
}
```

**File:** `packages/contracts/src/errors/error-codes.ts`

```typescript
// ✅ Error codes are system constants — the single source for the { code, message, details?, traceId } format
export enum ErrorCode {
  // system codes — fixed set shared by the exception filter, pipes, guards, rate-limit
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMITED = 'RATE_LIMITED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  // domain codes (MODULE_REASON), e.g.
  TASK_INVALID_STAGE_TRANSITION = 'TASK_INVALID_STAGE_TRANSITION',
  DICTIONARY_ITEM_ARCHIVED = 'DICTIONARY_ITEM_ARCHIVED',
}
```

**File:** `packages/contracts/src/auth/permissions.ts`

```typescript
// ✅ Permission keys are system constants used by RBAC guards
export enum Permission {
  USER_MANAGE = 'user.manage',
  TASK_CREATE = 'task.create',
  TASK_ASSIGN = 'task.assign',
  DICTIONARY_MANAGE = 'dictionary.manage',
  WORKFLOW_SCHEME_MANAGE = 'workflow.scheme.manage',
}
```

Why enums in contracts and not Prisma `enum` columns: contracts is the single source of truth shared by frontend, backend, and validators; a plain `String` column plus a contracts enum avoids a DB migration when the platform adds a system value and keeps the zod schemas, OpenAPI docs, and UI selects in sync automatically.

### Step 4: Validate with Zod at the Boundary

**File:** `packages/contracts/src/task/task.schemas.ts`

```typescript
import { z } from 'zod';
import { TaskSystemState } from './task-system-state';

export const changeTaskStageSchema = z.object({
  // ✅ Business reference: just an ID at the boundary — existence/activeness checked in the service
  stageId: z.string().uuid(),
});

export const taskFilterSchema = z.object({
  // ✅ System constant validated against the contracts enum
  status: z.nativeEnum(TaskSystemState).optional(),
  priorityId: z.string().uuid().optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ChangeTaskStageDto = z.infer<typeof changeTaskStageSchema>;
export type TaskFilterDto = z.infer<typeof taskFilterSchema>;
```

Business-list values are validated **in the service** against the database, not in zod: the valid set is data and changes at runtime.

### Step 5: Use Dictionaries and Enums in Service and Repository

**File:** `apps/api/src/modules/tasks/tasks.repository.ts`

```typescript
// ✅ Repository speaks domain language; Prisma stays inside
@Injectable()
export class TasksRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.task.findUnique({
      where: { id },
      include: { stage: true, priority: true },
    });
  }

  async changeStage(
    tx: Prisma.TransactionClient,
    id: string,
    stageId: string,
    systemState: TaskSystemState,
  ) {
    return tx.task.update({
      where: { id },
      data: { stageId, status: systemState },
    });
  }
}
```

**File:** `apps/api/src/modules/dictionaries/dictionaries.repository.ts`

```typescript
@Injectable()
export class DictionariesRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ✅ Domain-language method, not findMany({ where: ... })
  findActiveItem(dictionaryCode: string, itemId: string) {
    return this.prisma.dictionaryItem.findFirst({
      where: { id: itemId, dictionary: { code: dictionaryCode }, archivedAt: null },
    });
  }

  // ✅ Archive instead of delete — history and FK references stay valid (I15)
  archiveItem(itemId: string) {
    return this.prisma.dictionaryItem.update({
      where: { id: itemId },
      data: { archivedAt: new Date() },
    });
  }
}
```

**File:** `apps/api/src/modules/tasks/tasks.service.ts`

```typescript
// ✅ Business logic uses contracts enums for system values, DB lookups for business values
import { Injectable } from '@nestjs/common';
import { ErrorCode, TaskSystemState } from '@nodus/contracts';
import { DomainException } from '../../core/errors/domain-exception';
import { TransactionRunner } from '../../core/database/transaction-runner';
import { EventBus } from '../../core/events/event-bus';

@Injectable()
export class TasksService {
  constructor(
    private readonly txRunner: TransactionRunner,
    private readonly tasks: TasksRepository,
    private readonly workflow: WorkflowRepository,
    private readonly eventBus: EventBus,
  ) {}

  async changeStage(taskId: string, stageId: string, actorId: string) {
    const task = await this.tasks.findById(taskId);
    if (!task) throw new DomainException(ErrorCode.NOT_FOUND, 'Task not found');

    // ✅ Stage is data: validate existence + transition rights against WorkflowStage rows
    const stage = await this.workflow.findStageWithTransitions(stageId);
    if (!stage || stage.schemeId !== task.schemeId) {
      throw new DomainException(ErrorCode.VALIDATION_FAILED, 'Unknown stage for this task scheme');
    }
    if (!stage.allowedFromIds.includes(task.stageId)) {
      throw new DomainException(
        ErrorCode.TASK_INVALID_STAGE_TRANSITION,
        'Transition not allowed',
        { fromStageId: task.stageId, toStageId: stageId },
      );
    }

    await this.txRunner.run(async (tx) => {
      // ✅ System state derived from the stage's mapping — never passed by the client
      await this.tasks.changeStage(tx, taskId, stageId, stage.systemState as TaskSystemState);
      // ✅ Domain event in the same transaction (transactional outbox, I9)
      await this.eventBus.emit(tx, 'task.stage_changed', {
        taskId,
        fromStageId: task.stageId,
        toStageId: stageId,
        actorId,
      });
    });
  }

  // ✅ System-state queries use the contracts enum — compile-time checked, autocomplete works
  findOverdueByAssignee(assigneeId: string) {
    return this.tasks.findOverdueByAssignee(assigneeId, [
      TaskSystemState.ACTIVE,
      TaskSystemState.PAUSED,
    ]);
  }
}
```

### Step 6: Use System Enums in Guards and Shared Helpers

```typescript
// ✅ RBAC guards compare permission constants from contracts — no string literals
// apps/api/src/core/guards/permission.guard.ts (wiring is core-owned)
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Permission } from '@nodus/contracts';

@Injectable()
export class PermissionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const required: Permission[] = Reflect.getMetadata('requirePermissions', context.getHandler());
    if (!required?.length) return true;

    // ✅ Type-safe comparison against contracts constants
    return required.every((p) => request.user?.permissions?.includes(p));
  }
}

// ✅ OPTIONAL: enum helpers for system enums
// packages/contracts/src/utils/enum.utils.ts
export function isValidEnumValue<T extends Record<string, string>>(
  enumObj: T,
  value: string,
): value is T[keyof T] {
  return Object.values(enumObj).includes(value as T[keyof T]);
}

// Usage: sanitize untrusted input (e.g., WS payload) before branching
if (isValidEnumValue(TaskSystemState, rawStatus)) {
  // TypeScript narrows rawStatus to TaskSystemState
}
```

## Quick Reference Checklist

- [ ] No TypeScript enum (or Prisma enum) is created for an admin-editable business list
- [ ] Entities reference dictionary items / workflow stages by ID, never by name or code
- [ ] Dictionary items are archived, never hard-deleted
- [ ] System constants (system state, error codes, event names, permissions) are enums in `@nodus/contracts` only
- [ ] zod schemas validate IDs as `z.string().uuid()`; existence/activeness is checked in the service
- [ ] No string literal comparisons for statuses anywhere (`=== 'done'` is a bug)
- [ ] Display names of dictionary items come from data; UI labels come from i18n in contracts

**Incorrect:**

```typescript
// tasks/task-priority.enum.ts 🚨
export enum TaskPriority {           // ❌ Business list as enum — violates I15
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

// tasks/dto/change-priority.dto.ts 🚨
import { IsEnum } from 'class-validator';  // ❌ class-validator is not used in Nodus
export class ChangePriorityDto {
  @IsEnum(TaskPriority)
  priority: TaskPriority;            // ❌ Admin cannot add "Critical" without a deploy
}

// tasks/tasks.service.ts 🚨
@Injectable()
export class TasksService {
  async completeTask(id: string) {
    const task = await this.prisma.task.update({  // ❌ Prisma in service — bypasses repository
      where: { id },
      data: { status: 'done' },                   // ❌ Magic string; typo-prone
    });
    if (task.priority === 'high') { /* ... */ }   // ❌ Comparing display values
  }

  async deletePriority(id: string) {
    await this.prisma.dictionaryItem.delete({ where: { id } }); // ❌ Hard delete breaks history (I15)
  }
}

// schema.prisma 🚨
model Task {
  priority String // ❌ Free-text priority — no referential integrity, no rename safety
}
```

**Correct:**

```typescript
// packages/contracts/src/task/task-system-state.ts ✅
export enum TaskSystemState {        // ✅ System constant: platform-owned, release-managed
  BACKLOG = 'backlog',
  ACTIVE = 'active',
  PAUSED = 'paused',
  DONE = 'done',
  CLOSED = 'closed',
}

// packages/contracts/src/task/task.schemas.ts ✅
import { z } from 'zod';
export const changePrioritySchema = z.object({
  priorityId: z.string().uuid(),     // ✅ Business list enters the API as an ID
});
export type ChangePriorityDto = z.infer<typeof changePrioritySchema>;

// tasks/tasks.service.ts ✅
import { Injectable } from '@nestjs/common';
import { ErrorCode, TaskSystemState } from '@nodus/contracts';
import { DomainException } from '../../core/errors/domain-exception';
import { TransactionRunner } from '../../core/database/transaction-runner';
import { EventBus } from '../../core/events/event-bus';

@Injectable()
export class TasksService {
  constructor(
    private readonly txRunner: TransactionRunner,
    private readonly tasks: TasksRepository,
    private readonly dictionaries: DictionariesRepository,
    private readonly eventBus: EventBus,
  ) {}

  async changePriority(taskId: string, priorityId: string, actorId: string) {
    // ✅ Valid set lives in the DB: admins extend it at runtime, zero deploys
    const item = await this.dictionaries.findActiveItem('task_priority', priorityId);
    if (!item) {
      throw new DomainException(ErrorCode.DICTIONARY_ITEM_ARCHIVED, 'Unknown or archived priority');
    }

    await this.txRunner.run(async (tx) => {
      await this.tasks.setPriority(tx, taskId, priorityId);
      await this.eventBus.emit(tx, 'task.updated', { taskId, changed: ['priorityId'], actorId });
    });
  }

  async completeTask(taskId: string, actorId: string) {
    await this.txRunner.run(async (tx) => {
      // ✅ System constant from contracts — autocomplete, compile-time check, no typos
      await this.tasks.setSystemState(tx, taskId, TaskSystemState.DONE);
      await this.eventBus.emit(tx, 'task.completed', { taskId, actorId });
    });
  }
}

// dictionaries/dictionaries.service.ts ✅
async removeItem(itemId: string) {
  // ✅ Archive preserves references in existing tasks, reports, and history (I15)
  await this.dictionaries.archiveItem(itemId);
}
```

## Advanced: Dictionary Reads Are Hot — Cache Them

Every task list row renders a priority and a stage name. Cache active dictionary items and stages in Redis (see `performance-redis-caching`), keyed by dictionary code, and invalidate on dictionary/stage change events:

```typescript
// ✅ Consumers read through a cached projection; the DB stays the source of truth
@Injectable()
export class DictionaryCache {
  async getActiveItems(dictionaryCode: string): Promise<DictionaryItemDto[]> {
    const cached = await this.redis.get(`dict:${dictionaryCode}`);
    if (cached) return JSON.parse(cached);
    const items = await this.dictionaries.findActiveItems(dictionaryCode);
    await this.redis.set(`dict:${dictionaryCode}`, JSON.stringify(items), 'EX', 300);
    return items;
  }
}
```

## Advanced: String Union Types for System Constant Sets

When a set of system constants is consumed mostly as a type (e.g., event names), a const array + union type is a good alternative to an enum — it is tree-shakeable and iterates naturally:

```typescript
// packages/contracts/src/events/event-names.ts
export const DOMAIN_EVENT_NAMES = [
  'task.created',
  'task.updated',
  'task.stage_changed',
  'task.completed',
  'correspondence.resolution_issued',
  // ... catalog only extends; renaming/removing is forbidden
] as const;

export type DomainEventName = (typeof DOMAIN_EVENT_NAMES)[number];

const name: DomainEventName = 'task.created';   // ✅ Valid
const bad: DomainEventName = 'task.cretaed';    // ❌ Compile error
```

## Advanced: Why Not Const Enums

```typescript
// ❌ Avoid const enums anywhere in Nodus
export const enum TaskSystemState { /* ... */ }
```

Const enums are inlined at compile time and break under `isolatedModules` (required by the Vite/esbuild frontend toolchain) and under project-reference builds in the monorepo. Use regular enums or const arrays in `@nodus/contracts`.

## Best Practices Summary

| Practice | Why |
|----------|-----|
| Business lists in `dictionaries`/`WorkflowStage` | Admins edit vocabularies at runtime; no deploys (I15) |
| Reference items by ID, archive on removal | Renames are safe; history and reports stay valid |
| System constants as enums in `@nodus/contracts` | One source for api, web, ws-gateway; compile-time safety |
| Validate business IDs in the service, not in zod | The valid set is runtime data |
| Compare system values via contracts enums only | Typos become compile errors, not production bugs |
| Item display names are data; UI labels are i18n keys | Both sides of I15 stay consistent |
| No Prisma enums, no const enums | Contracts stay the single source; `isolatedModules` compatibility |

**Sources:**
- `docs/architecture/invariants.md` (I15) and `docs/architecture/data-model.md` (Dictionary, WorkflowStage, Task system state)
- `docs/architecture/patterns.md` (contracts as the single exchange point)
