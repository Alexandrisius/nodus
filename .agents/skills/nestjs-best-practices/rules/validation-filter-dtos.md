---
title: Use Filter DTOs for Query Parameter Validation
impact: HIGH
impactDescription: Validates and type-checks query parameters
section: 5
tags: validation, query, dto, filter, search, pagination, zod
---

Extracting query parameters individually (`@Query('status') status: string`) results in no validation, no type safety, and verbose code. Filter DTOs validate all query parameters consistently and provide automatic type transformation. In Nodus a "filter DTO" is a **zod schema in `@nodus/contracts`** applied at the endpoint with the core `ZodValidationPipe` — one schema shared by the API and the frontend filter form (I7).

## For AI Agents

When implementing or reviewing query parameter handling, **always** follow these steps:

### Step 1: Check for Individual Query Parameters
**Pattern to check:** Look for `@Query()` decorators with parameter names, manual string parsing, or optional chaining.

```typescript
// ❌ WRONG - Individual parameters with no validation
@Get()
findAll(
  @Query('stage') stage: string,          // ❌ No validation
  @Query('search') search: string,        // ❌ No validation
  @Query('cursor') cursor: string,        // ❌ Passed through unchecked
  @Query('limit') limit: string,          // ❌ String instead of number
) {
  // ❌ Manual type conversion in a controller
  const limitNum = parseInt(limit) || 50;
  // ...
}

// ❌ WRONG - Manual parsing with no validation
@Get()
findAll(@Query() query: any) {
  const stageId = query.stage as string;       // ❌ Type assertion
  const limit = parseInt(query.limit) || 50;    // ❌ Manual parse, unbounded
  // ...
}
```

**If found:** Replace with a filter schema from contracts + `ZodValidationPipe`.

### Step 2: Check for Hard-Coded Business Enums (I15)
**Pattern to check:** `z.enum([...])` or a TypeScript `enum` describing business statuses or types (task stage, letter type, priority).

```typescript
// ❌ WRONG - workflow stage frozen in code (I15 violation)
// Adding/renaming a stage now needs a deploy instead of a workflow-scheme row
export const taskStageSchema = z.enum(['NEW', 'IN_WORK', 'ON_REVIEW']);

export const getTasksFilterSchema = z.object({
  stage: taskStageSchema.optional(),
});
```

```typescript
// ✅ CORRECT - a stage is a WorkflowStage row; the filter carries its UUID
stageId: z.string().uuid().optional(),
```

```prisma
// prisma/schema.prisma (excerpt) — business lists are data, not code
model Task {
  id         String          @id @default(uuid())
  title      String
  status     TaskSystemState @default(backlog) // system state — enum mirrored from @nodus/contracts
  stageId    String          @map("stage_id")    // → WorkflowStage row (data): the user-visible "status"
  priorityId String?         @map("priority_id") // → DictionaryItem row (data, I15)

  stage      WorkflowStage   @relation(fields: [stageId], references: [id])
  priority   DictionaryItem? @relation(fields: [priorityId], references: [id])
}
```

`z.enum` stays legal **only for system constants** in `@nodus/contracts`: sort direction, error codes, event types, system states. See `validation-custom-pipes.md` for the system-constant pipe.

### Step 3: Create the Filter Schema in Contracts
**File:** `packages/contracts/src/task/get-tasks-filter.schema.ts`

```typescript
// ✅ REQUIRED: the filter schema lives in contracts — one definition for API and UI
import { z } from 'zod';
import { cursorPaginationSchema } from '../common/cursor-pagination.schema';

export const getTasksFilterSchema = cursorPaginationSchema.extend({
  // ✅ Stage filtered by WorkflowStage ID (data) — never an enum
  stageId: z.string().uuid().optional(),

  // ✅ Optional free-text search, trimmed, with a sane minimum length
  search: z.string().trim().min(3).max(200).optional(),

  // ✅ Dates are UTC ISO 8601 strings (I7); .datetime() enforces the trailing 'Z'
  createdAfter: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),
});

// ✅ The DTO type is inferred — no class, no decorators
export type GetTasksFilterDto = z.infer<typeof getTasksFilterSchema>;
```

> **Coercion note:** Fastify delivers every query parameter as a string. Numbers must use `z.coerce.number()` — plain `z.number()` would reject `"50"`. Strings, UUIDs and datetime strings need no coercion. Defaults (`.default(50)`) replace manual `|| 50` fallbacks.

### Step 4: Reuse the Shared Pagination Schema
**File:** `packages/contracts/src/common/cursor-pagination.schema.ts`

```typescript
// ✅ REQUIRED: one pagination schema for every list endpoint
import { z } from 'zod';

// api-conventions: every list takes ?cursor=&limit= (limit ≤ 100, default 50)
export const cursorPaginationSchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CursorPaginationDto = z.infer<typeof cursorPaginationSchema>;

// ✅ Every list endpoint answers with the same envelope — no page/total metadata
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null; // null on the last page
}
```

Offset fields (`page`, `offset`, `skip`) are banned project-wide (I7). See `api-cursor-pagination.md` for the repository-side cursor implementation.

### Step 5: Add Sort Fields as System Constants

Sorting needs a closed whitelist — raw client input must never reach `orderBy`. A sortable-field list is an API constant, not business data, so `z.enum` is allowed here (I15):

```typescript
// packages/contracts/src/common/sort.ts ✅
import { z } from 'zod';

export const SortDirectionSchema = z.enum(['asc', 'desc']);
export type SortDirection = z.infer<typeof SortDirectionSchema>;

// packages/contracts/src/task/task-sort.ts ✅
import { z } from 'zod';

// ✅ Whitelist of columns the API allows to sort by — a system constant
export const TaskSortFieldSchema = z.enum(['title', 'createdAt', 'updatedAt', 'dueDate']);
export type TaskSortField = z.infer<typeof TaskSortFieldSchema>;
```

```typescript
// get-tasks-filter.schema.ts — extended with sort
export const getTasksFilterSchema = cursorPaginationSchema.extend({
  stageId: z.string().uuid().optional(),
  search: z.string().trim().min(3).max(200).optional(),
  sortBy: TaskSortFieldSchema.default('createdAt'),
  direction: SortDirectionSchema.default('desc'),
});
```

The repository always appends a unique tiebreaker (`id`) to the chosen column — a deterministic sort is what makes cursor pagination stable (I7).

### Step 6: Re-export and Validate in the Controller

```typescript
// apps/api/src/modules/tasks/dto/index.ts ✅
// dto/ re-exports contracts schemas — no duplicated definitions
export { getTasksFilterSchema } from '@nodus/contracts';
export type { GetTasksFilterDto } from '@nodus/contracts';
```

```typescript
// apps/api/src/modules/tasks/tasks.controller.ts ✅
import { Controller, Get, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { getTasksFilterSchema, type GetTasksFilterDto } from './dto';
import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  findAll(@Query(new ZodValidationPipe(getTasksFilterSchema)) filter: GetTasksFilterDto) {
    // ✅ filter is parsed, validated and fully typed:
    //    filter.limit is number 1..100 (default 50) — not a string
    //    filter.stageId is a UUID or undefined
    //    unknown query keys are stripped by the schema
    return this.tasksService.getTasks(filter);
  }
}
```

The pipe throws `DomainException(ErrorCode.VALIDATION_FAILED, { issues })` on invalid input; the global exception filter renders the standard `{ code, message, details, traceId }` body (see `validation-dto-validation.md`).

### Step 7: Build the Query in the Repository — Prisma Lives Only Here

The service never sees Prisma types; it calls domain-language methods. Clause-by-clause:

```typescript
// ✅ Every clause starts from a validated, typed value — no string casts
const where: Prisma.TaskWhereInput = { assigneeId };

// ✅ stageId is a validated UUID — a non-existent stage row simply matches nothing
if (stageId) {
  where.stageId = stageId;
}

// ✅ Postgres case-insensitive contains — safe: Prisma parameterizes values
if (search) {
  where.OR = [
    { title: { contains: search, mode: 'insensitive' } },
    { description: { contains: search, mode: 'insensitive' } },
  ];
}

// ✅ Date range from validated UTC ISO strings
if (createdAfter || createdBefore) {
  where.createdAt = {
    ...(createdAfter && { gte: new Date(createdAfter) }),
    ...(createdBefore && { lte: new Date(createdBefore) }),
  };
}
```

```typescript
// ✅ Deterministic order + cursor window — assembled fully in the CORRECT example below
const orderBy: Prisma.TaskOrderByWithRelationInput[] = [
  { [sortBy]: direction }, // sortBy is a whitelisted enum value — never raw input
  { id: direction },       // unique tiebreaker => deterministic order
];
```

The assembled repository is shown in the **Correct** section below.

**Incorrect:**

```typescript
// apps/api/src/modules/tasks/tasks.controller.ts 🚨
import { Controller, Get, Query } from '@nestjs/common';

@Controller('tasks')
export class TasksController {
  @Get()
  findAll(
    @Query('stage') stage: string,     // 🚨 no validation, any string passes
    @Query('search') search: string,   // 🚨 no length limits
    @Query('page') page: string,       // 🚨 offset pagination (banned, I7)
    @Query('limit') limit: string,     // 🚨 string, not number
  ) {
    const pageNum = parseInt(page) || 1;     // 🚨 manual parsing in a controller
    const limitNum = parseInt(limit) || 10;  // 🚨 unbounded — ?limit=1000000 passes
    return this.tasksService.getTasks(stage, search, pageNum, limitNum);
  }
}

// apps/api/src/modules/tasks/tasks.service.ts 🚨
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {} // 🚨 Prisma in the service

  // 🚨 positional params: which values are valid for stage? No hints; wrong order still compiles
  async getTasks(stage: string | undefined, search: string | undefined, page: number, limit: number) {
    return this.prisma.task.findMany({
      where: {
        ...(stage && { stageId: stage }), // 🚨 'INVALID' silently matches nothing
        ...(search && {
          OR: [
            { title: { contains: search } },
            { description: { contains: search } },
          ],
        }),
      },
      skip: (page - 1) * limit, // 🚨 OFFSET scans and discards rows (see api-cursor-pagination.md)
      take: limit,
      // 🚨 no orderBy — page contents are nondeterministic between requests
    });
  }
}
```

**Correct:**

```typescript
// packages/contracts/src/task/get-tasks-filter.schema.ts ✅
import { z } from 'zod';
import { cursorPaginationSchema } from '../common/cursor-pagination.schema';
import { SortDirectionSchema } from '../common/sort';
import { TaskSortFieldSchema } from './task-sort';

export const getTasksFilterSchema = cursorPaginationSchema.extend({
  stageId: z.string().uuid().optional(),
  search: z.string().trim().min(3).max(200).optional(),
  createdAfter: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),
  sortBy: TaskSortFieldSchema.default('createdAt'),
  direction: SortDirectionSchema.default('desc'),
});

export type GetTasksFilterDto = z.infer<typeof getTasksFilterSchema>;

// apps/api/src/modules/tasks/tasks.controller.ts ✅
import { Controller, Get, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { getTasksFilterSchema, type GetTasksFilterDto } from './dto';
import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  findAll(@Query(new ZodValidationPipe(getTasksFilterSchema)) filter: GetTasksFilterDto) {
    // ✅ single parameter, fully typed and validated
    return this.tasksService.getTasks(filter);
  }
}

// apps/api/src/modules/tasks/tasks.service.ts ✅
import { Injectable } from '@nestjs/common';
import type { CursorPage, GetTasksFilterDto } from '@nodus/contracts';
import type { Task } from '@prisma/client';
import { TasksRepository } from './tasks.repository';

@Injectable()
export class TasksService {
  constructor(private readonly tasksRepository: TasksRepository) {}

  // ✅ one typed parameter in, one typed page out — no Prisma, no HTTP
  getTasks(filter: GetTasksFilterDto, actorId: string): Promise<CursorPage<Task>> {
    return this.tasksRepository.findPageByAssignee(filter, actorId);
  }
}

// apps/api/src/modules/tasks/tasks.repository.ts ✅
import { Injectable } from '@nestjs/common';
import { Prisma, Task } from '@prisma/client';
import type { CursorPage, GetTasksFilterDto } from '@nodus/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { decodeCursor, encodeCursor } from '../../core/pagination/cursor.util';

@Injectable()
export class TasksRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ✅ domain-language method — the service never sees Prisma types
  async findPageByAssignee(filter: GetTasksFilterDto, assigneeId: string): Promise<CursorPage<Task>> {
    const { stageId, search, createdAfter, createdBefore, sortBy, direction, cursor, limit } = filter;

    const where: Prisma.TaskWhereInput = { assigneeId };

    if (stageId) {
      where.stageId = stageId;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (createdAfter || createdBefore) {
      where.createdAt = {
        ...(createdAfter && { gte: new Date(createdAfter) }),
        ...(createdBefore && { lte: new Date(createdBefore) }),
      };
    }

    const rows = await this.prisma.task.findMany({
      where,
      take: limit + 1, // one extra row tells us whether a next page exists
      ...(cursor && { cursor: { id: decodeCursor(cursor).id }, skip: 1 }),
      orderBy: [
        { [sortBy]: direction }, // whitelisted enum value — never raw client input
        { id: direction },       // unique tiebreaker => deterministic order
      ],
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items.at(-1);

    return {
      items,
      nextCursor: hasMore && last ? encodeCursor({ id: last.id }) : null,
    };
  }
}
```

## Advanced: Typed Page Responses

```typescript
// ✅ The response envelope is shared from contracts — handlers never invent their own
import type { CursorPage } from '@nodus/contracts';

// tasks.controller.ts
@Get()
findAll(
  @Query(new ZodValidationPipe(getTasksFilterSchema)) filter: GetTasksFilterDto,
): Promise<CursorPage<TaskDto>> {
  return this.tasksService.getTasks(filter);
}
```

No `total` / `totalPages` in the envelope: an exact count costs a full scan per request and is instantly stale under concurrent writes. The UI shows "load more", not page numbers. If a screen truly needs a count (registry statistics), expose a dedicated aggregate endpoint — do not bolt totals onto the list envelope.

## Advanced: Composing Filter Schemas

```typescript
// packages/contracts/src/common/date-range-filter.schema.ts ✅
import { z } from 'zod';

// ✅ Shared building block, composed per resource
export const dateRangeFilterSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

// packages/contracts/src/correspondence/get-letters-filter.schema.ts ✅
import { z } from 'zod';
import { cursorPaginationSchema } from '../common/cursor-pagination.schema';
import { dateRangeFilterSchema } from '../common/date-range-filter.schema';

export const getLettersFilterSchema = cursorPaginationSchema
  .merge(dateRangeFilterSchema)
  .extend({
    correspondentId: z.string().uuid().optional(), // dictionary: correspondents
    letterTypeId: z.string().uuid().optional(),    // dictionary: letter types (I15)
    search: z.string().trim().min(3).max(200).optional(),
  });

export type GetLettersFilterDto = z.infer<typeof getLettersFilterSchema>;
```

> `.merge()` / `.extend()` exist only on `ZodObject`. Once `.refine()` / `.superRefine()` is applied, the schema becomes `ZodEffects` and can no longer be extended — so compose first, refine last (next section).

## Advanced: Cross-Field Validation (replaces Validation Groups)

class-validator's `@ValidateIf` and validation groups have no direct zod equivalent — conditional rules live in the schema as refinements:

```typescript
// packages/contracts/src/task/get-tasks-filter.schema.ts ✅
import { z } from 'zod';
import { cursorPaginationSchema } from '../common/cursor-pagination.schema';

export const getTasksFilterSchema = cursorPaginationSchema
  .extend({
    stageId: z.string().uuid().optional(),
    // ✅ only validated when present; minimum length protects the LIKE scan
    search: z.string().trim().min(3, 'Search must be at least 3 characters').optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  })
  .superRefine((value, ctx) => {
    // ✅ 'from' and 'to' must come as a pair (was @ValidateIf in class-validator)
    if ((value.from === undefined) !== (value.to === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [value.from === undefined ? 'from' : 'to'],
        message: 'from and to must be provided together',
      });
    }

    // ✅ Range must be ordered
    if (value.from && value.to && new Date(value.from) > new Date(value.to)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['from'],
        message: 'from must not be after to',
      });
    }
  });

export type GetTasksFilterDto = z.infer<typeof getTasksFilterSchema>;
```

Refinements run after parsing, so coercions and defaults are already applied. Issues surface through the same `ZodValidationPipe` error body — `details` carries `path` + `message`, so the frontend renders field errors from one place.

## Best Practices Summary

| Practice | Why |
|----------|-----|
| Filter schemas in `@nodus/contracts` | One source of truth, shared with frontend filter forms |
| Validate via `ZodValidationPipe` at the endpoint | Explicit schema per route, fully typed result |
| `z.coerce.number()` for numeric query params | Fastify delivers query params as strings |
| `.default()` instead of manual fallbacks | Defaults declared once, applied on parse |
| Stage/priority/dictionary IDs for business filters (I15) | Stages, priorities and types live in data, not in code |
| `z.enum` only for system constants | Sort fields/direction are API constants, not business data |
| Whitelist sortable columns | Raw input must never reach `orderBy` |
| Compose with `.extend()` / `.merge()`, refine last | `ZodEffects` cannot be extended further |
| Cursor pagination fields from the shared schema | `?cursor=&limit=`, limit ≤ 100, default 50 (I7) |
| Prisma only in `*.repository.ts` | Service stays testable; one point for indexes and soft-delete |
