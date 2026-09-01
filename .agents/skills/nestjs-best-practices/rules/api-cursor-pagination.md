---
title: Use Cursor-Based Pagination for Large Datasets
impact: HIGH
section: 8
impactDescription: 10-100x faster than offset for large datasets
tags: api, pagination, performance, prisma, zod
---

Offset-based pagination (`OFFSET` + `LIMIT`) becomes slow as the offset grows because the database must scan and discard all previous rows. Cursor-based (keyset) pagination uses indexed columns to jump directly to the correct position, providing consistent performance regardless of page depth.

In Nodus cursor pagination is not an option, it is the convention (I7, api-conventions): **every** list endpoint takes `?cursor=&limit=` (limit ≤ 100, default 50), answers `{ items, nextCursor }`, and sorts deterministically. Offset mode does not exist anywhere — not even for admin tables.

> **Hint**: One shape for all lists — tasks, letters, chat history, audit log. The frontend consumes it with a single TanStack Query `useInfiniteQuery` pattern; jumping "to page 37" is replaced by filters and search.

## For AI Agents

When implementing or reviewing pagination, **always** follow these steps:

### Step 1: Check Pagination Pattern
**Pattern to check:** Look for `skip`/`take` with a page number, `offset`/`limit` parameters, or `page` in DTOs.

```typescript
// ❌ WRONG - Offset pagination (slow for large offsets, banned by I7)
async findPage(page: number, limit: number) {
  return this.prisma.user.findMany({
    skip: (page - 1) * limit,  // scans and discards rows; no stable order
    take: limit,
  });
}

// ✅ CORRECT - Keyset pagination (fast at any depth)
async findPage(limit: number, cursor?: string) {
  return this.prisma.user.findMany({
    take: limit + 1,                                  // +1 detects the next page
    ...(cursor && { cursor: { id: cursor }, skip: 1 }), // skip: 1 excludes the cursor row itself
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],   // deterministic: unique tiebreaker
  });
}
```

**If found:** Replace offset pagination with the cursor pattern below.

### Step 2: Reuse the Shared Pagination Schema
**File:** `packages/contracts/src/common/cursor-pagination.schema.ts`

```typescript
// ✅ REQUIRED: one pagination schema for every list endpoint — never redefine per module
import { z } from 'zod';

export const cursorPaginationSchema = z.object({
  // opaque cursor from the previous response's nextCursor; omit for the first page
  cursor: z.string().min(1).optional(),
  // api-conventions: limit ≤ 100, default 50; z.coerce because Fastify sends strings
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CursorPaginationDto = z.infer<typeof cursorPaginationSchema>;

// ✅ The single list envelope — no pageInfo, no edges, no totals, no success wrapper
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null; // null on the last page
}
```

Resource filters extend this schema (`cursorPaginationSchema.extend({...})`) — see `validation-filter-dtos.md`.

### Step 3: Encode/Decode Cursors in Core
**File:** `apps/api/src/core/pagination/cursor.util.ts`

Node's `Buffer` handles base64url natively — no extra dependency. The decoded payload is validated before use: a cursor is client input.

```typescript
// ✅ REQUIRED: opaque, validated cursors
import { z } from 'zod';

const cursorPayloadSchema = z.object({
  id: z.string().uuid(),
});

export type Cursor = z.infer<typeof cursorPayloadSchema>;

export class InvalidCursorError extends Error {
  constructor() {
    super('Cursor is malformed');
    this.name = 'InvalidCursorError';
  }
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): Cursor {
  try {
    const json: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    return cursorPayloadSchema.parse(json);
  } catch {
    throw new InvalidCursorError();
  }
}
```

The service maps `InvalidCursorError` to a domain exception with `ErrorCode.INVALID_CURSOR` from `@nodus/contracts`; the global filter answers HTTP 400 in the standard format:

```json
{
  "code": "INVALID_CURSOR",
  "message": "Cursor is malformed",
  "traceId": "3fa85f64-5717-4562-b3fc-2c963f66afa6"
}
```

Never silently restart from the first page on a bad cursor — a silent reset hides client bugs and breaks idempotent consumers.

### Step 4: Implement the Query in the Repository
**File:** `apps/api/src/modules/users/users.repository.ts`

Prisma is touched only in `*.repository.ts`. The repository owns the `take + 1` window, the deterministic order and the cursor math:

```typescript
// ✅ REQUIRED: cursor window inside the repository
import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import type { CursorPage, CursorPaginationDto } from '@nodus/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { decodeCursor, encodeCursor } from '../../core/pagination/cursor.util';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPage(filter: CursorPaginationDto): Promise<CursorPage<User>> {
    const { limit, cursor } = filter;

    const rows = await this.prisma.user.findMany({
      take: limit + 1, // one extra row tells us whether a next page exists
      ...(cursor && {
        cursor: { id: decodeCursor(cursor).id },
        skip: 1, // exclude the cursor row itself
      }),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], // deterministic
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

### Step 5: Wire Service and Controller

```typescript
// apps/api/src/modules/users/users.service.ts ✅
import { Injectable } from '@nestjs/common';
import type { CursorPage, CursorPaginationDto } from '@nodus/contracts';
import type { User } from '@prisma/client';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  // ✅ thin: no Prisma, no cursor math — just delegation
  findAll(filter: CursorPaginationDto): Promise<CursorPage<User>> {
    return this.usersRepository.findPage(filter);
  }
}

// apps/api/src/modules/users/users.controller.ts ✅
import { Controller, Get, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { cursorPaginationSchema, type CursorPaginationDto } from '@nodus/contracts';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(@Query(new ZodValidationPipe(cursorPaginationSchema)) filter: CursorPaginationDto) {
    // GET /api/v1/users?limit=50&cursor=eyJpZCI6Ii4uLiJ9
    return this.usersService.findAll(filter);
  }
}
```

## Quick Reference Checklist

Use this checklist when reviewing or creating list endpoints:

- [ ] Endpoint takes `?cursor=&limit=` — never `page` / `offset` / `skip` (I7)
- [ ] `limit` validated ≤ 100, default 50, via the shared contracts schema
- [ ] Response shape `{ items, nextCursor }` — no `pageInfo`, no totals, no success wrapper
- [ ] Sort is deterministic: ordered columns end with a unique tiebreaker (`id`)
- [ ] Query fetches `limit + 1` rows; the extra row only decides `nextCursor`
- [ ] `skip: 1` present when a cursor is used (the cursor row itself is excluded)
- [ ] Cursor is opaque: base64url JSON via Node `Buffer` — no extra dependency
- [ ] Malformed cursor → 400 with an error code from `@nodus/contracts`, never a silent reset
- [ ] Prisma is called only from `*.repository.ts`
- [ ] Empty page returns `{ items: [], nextCursor: null }`

**Incorrect:**

```typescript
// packages/contracts — offset-shaped schema 🚨 banned by I7
import { z } from 'zod';

export const getUsersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type GetUsersDto = z.infer<typeof getUsersSchema>;

// apps/api/src/modules/users/users.service.ts 🚨
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {} // 🚨 Prisma in the service

  async findAll(dto: GetUsersDto) {
    const { page, limit } = dto;
    const skip = (page - 1) * limit;

    // Page 1000 at limit 50: scans 49,950 rows just to return 50
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        skip, // 🚨 scans and discards rows
        take: limit,
        orderBy: { createdAt: 'desc' }, // 🚨 no tiebreaker — unstable under concurrent writes
      }),
      this.prisma.user.count(), // 🚨 full-table count on every request
    ]);

    return {
      data: users, // 🚨 non-standard envelope
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit), // 🚨 stale the moment it is computed
      },
    };
  }
}

/* Performance issues:
 * Page 1:     ~1ms    (scans 0 rows)
 * Page 10:    ~5ms    (scans 450 rows)
 * Page 100:   ~50ms   (scans 4,950 rows)
 * Page 1000:  ~500ms  (scans 49,950 rows)
 * Page 10000: ~5000ms (scans 499,950 rows)
 * Plus: rows inserted while paging cause duplicates/misses between pages.
 */
```

**Correct:**

```typescript
// packages/contracts/src/common/cursor-pagination.schema.ts ✅
import { z } from 'zod';

export const cursorPaginationSchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CursorPaginationDto = z.infer<typeof cursorPaginationSchema>;

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

// apps/api/src/core/pagination/cursor.util.ts ✅
import { z } from 'zod';

const cursorPayloadSchema = z.object({ id: z.string().uuid() });
export type Cursor = z.infer<typeof cursorPayloadSchema>;

export class InvalidCursorError extends Error {
  constructor() {
    super('Cursor is malformed');
    this.name = 'InvalidCursorError';
  }
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): Cursor {
  try {
    const json: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    return cursorPayloadSchema.parse(json);
  } catch {
    throw new InvalidCursorError();
  }
}

// apps/api/src/modules/users/users.repository.ts ✅
import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import type { CursorPage, CursorPaginationDto } from '@nodus/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { decodeCursor, encodeCursor } from '../../core/pagination/cursor.util';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPage(filter: CursorPaginationDto): Promise<CursorPage<User>> {
    const { limit, cursor } = filter;

    const rows = await this.prisma.user.findMany({
      take: limit + 1,
      ...(cursor && { cursor: { id: decodeCursor(cursor).id }, skip: 1 }),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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

// apps/api/src/modules/users/users.service.ts ✅
import { Injectable } from '@nestjs/common';
import type { CursorPage, CursorPaginationDto } from '@nodus/contracts';
import type { User } from '@prisma/client';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  findAll(filter: CursorPaginationDto): Promise<CursorPage<User>> {
    return this.usersRepository.findPage(filter);
  }
}

// apps/api/src/modules/users/users.controller.ts ✅
import { Controller, Get, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { cursorPaginationSchema, type CursorPaginationDto } from '@nodus/contracts';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(@Query(new ZodValidationPipe(cursorPaginationSchema)) filter: CursorPaginationDto) {
    return this.usersService.findAll(filter);
  }
}

/* Performance:
 * Page 1:     ~1ms (consistent)
 * Page 10:    ~1ms (consistent)
 * Page 100:   ~1ms (consistent)
 * Page 1000:  ~1ms (consistent)
 * Page 10000: ~1ms (consistent)
 */
```

## Cursor Pagination with Prisma

### The `cursor` Shorthand Needs a Unique Selector

Prisma's `cursor` option points at a row by a **unique** field (`@id`, `@unique`, or a compound `@@unique` key). Combined with `skip: 1`, the window continues strictly after that row, following the `orderBy`:

```typescript
// ✅ First page
const firstPage = await this.prisma.task.findMany({
  take: 51,
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
});

// ✅ Next page: continue after the last row of the previous page
const nextPage = await this.prisma.task.findMany({
  take: 51,
  cursor: { id: lastTaskId },
  skip: 1, // without skip the last row of the previous page repeats
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
});
```

### Keyset `where` for Non-Unique Sort Columns

Sorting by a non-unique column (e.g. `dueDate`) needs an explicit keyset predicate — the cursor payload then carries both the sort value and the tiebreaker id:

```typescript
// apps/api/src/core/pagination/task-cursor.util.ts ✅
import { z } from 'zod';

export const taskCursorSchema = z.object({
  dueDate: z.string().datetime(),
  id: z.string().uuid(),
});
export type TaskCursor = z.infer<typeof taskCursorSchema>;
```

```typescript
// apps/api/src/modules/tasks/tasks.repository.ts ✅
async findPageByDueDate(filter: CursorPaginationDto): Promise<CursorPage<Task>> {
  const { limit, cursor } = filter;
  const position = cursor ? decodeTaskCursor(cursor) : undefined;

  const rows = await this.prisma.task.findMany({
    take: limit + 1,
    ...(position && {
      where: {
        OR: [
          // ✅ strictly after the cursor position in (dueDate, id) order
          { dueDate: { lt: new Date(position.dueDate) } },
          { dueDate: new Date(position.dueDate), id: { lt: position.id } },
        ],
      },
    }),
    orderBy: [{ dueDate: 'desc' }, { id: 'desc' }],
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);

  return {
    items,
    nextCursor:
      hasMore && last
        ? encodeTaskCursor({ dueDate: last.dueDate.toISOString(), id: last.id })
        : null,
  };
}
```

This is the general form — it works for any sort column and never depends on a Prisma compound-unique constraint. The index backing it is a composite one: `@@index([dueDate(sort: Desc), id(sort: Desc)])`.

## Why Not Relay Connections, and Why No Offset Mode at All

Relay-style `first`/`after` with `edges`/`pageInfo` was designed for GraphQL. Nodus REST lists use the flat `{ items, nextCursor }` envelope: one shape for every list, trivially consumed by `useInfiniteQuery`, with no per-endpoint metadata dialect. Backward pagination (`last`/`before`) is deliberately omitted — Nodus lists are newest-first feeds with infinite scroll, and "go to page 37" is served by filters and search instead. Offset pagination survives nowhere, admin tables included (I7): it degrades with depth, returns inconsistent pages under writes, and its `COUNT(*)` per request penalizes every user for a feature almost nobody clicks.

## Edge Cases and Solutions

### Empty Results

An empty page is a normal answer, not an error — first page on an empty table, filters matching nothing, or a cursor pointing past the end:

```typescript
// ✅ Uniform empty page — the repository code already produces exactly this
{ items: [], nextCursor: null }
```

No special-casing in the service or controller; `items.at(-1)` on an empty array is `undefined`, so `nextCursor` is `null`.

### Invalid Cursor

Decode failures throw `InvalidCursorError` (Step 3) and surface as HTTP 400 with `ErrorCode.INVALID_CURSOR`. Do not catch-and-restart: a client that holds a garbage cursor has a bug, and silently returning page 1 makes that bug invisible and the client's dedup logic wrong.

### Deleted Items and Concurrent Writes

Keyset pagination stores **values, not positions**, so deletions don't shift subsequent pages:

- A row deleted after you paged past it is simply never referenced again — the cursor points at its own successor.
- Rows inserted while paging land ahead of the current position (newest-first feeds) and appear on the next refresh — they never duplicate inside the walk, because the `WHERE` predicate is a strict inequality against the cursor values.
- The unique `id` tiebreaker guarantees a total order, so two rows with identical `createdAt`/`dueDate` can't swap places between requests.

This is exactly where offset pagination fails: deleting one row shifts every later page by one, duplicating one row and hiding another.

### Cursors Are Opaque, Not Encrypted

Base64url is encoding, not protection. Keep the payload minimal (`id`, or sort value + `id`) — never embed user data, filters, or anything sensitive. Clients must treat the cursor as an opaque token: the frontend stores `nextCursor` and sends it back verbatim, never decodes or constructs one.

## Frontend Integration

TanStack Query has cursor pagination built in via `useInfiniteQuery`; deduplication, caching and background refetch come for free. Query keys go through the feature's key factory (patterns.md), and data fetching lives only in `api/` hooks.

```typescript
// apps/web/src/features/tasks/api/tasks-keys.ts ✅
export const tasksKeys = {
  all: ['tasks'] as const,
  lists: () => [...tasksKeys.all, 'list'] as const,
  list: (filter: TasksListFilter) => [...tasksKeys.lists(), filter] as const,
};

// apps/web/src/features/tasks/api/use-tasks.ts ✅
import { useInfiniteQuery } from '@tanstack/react-query';
import type { CursorPage, TaskDto } from '@nodus/contracts';
import { apiFetch } from '@/shared/lib/api-fetch'; // shared typed fetch wrapper
import { tasksKeys } from './tasks-keys';
import type { TasksListFilter } from '../model/types';

export function useTasks(filter: TasksListFilter) {
  return useInfiniteQuery({
    queryKey: tasksKeys.list(filter),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '50', ...filter });
      if (pageParam) params.set('cursor', pageParam);
      return apiFetch<CursorPage<TaskDto>>(`/api/v1/tasks?${params}`);
    },
    initialPageParam: undefined as string | undefined,
    // ✅ nextCursor === null ends the walk; undefined tells TQ there is no next page
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}
```

```tsx
// apps/web/src/features/tasks/components/task-list.tsx ✅
import { useEffect, useRef } from 'react';
import { useTasks } from '../api/use-tasks';
import type { TasksListFilter } from '../model/types';

export function TaskList({ filter }: { filter: TasksListFilter }) {
  const { data, hasNextPage, fetchNextPage, isFetchingNextPage } = useTasks(filter);
  const sentinelRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // ✅ pages accumulate; the render is one flat list
  const tasks = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <ul>
      {tasks.map((task) => (
        <li key={task.id}>{task.title}</li>
      ))}
      {/* sentinel observed to trigger the next page */}
      <li ref={sentinelRef} aria-hidden />
      {/* t() — i18n helper backed by @nodus/contracts/i18n; UI strings never hard-coded (I15) */}
      {isFetchingNextPage && <li>{t('tasks.list.loadingMore')}</li>}
    </ul>
  );
}
```

Because `nextCursor` is part of the page data (not component state), TanStack Query's cache survives navigation: returning to the list restores all loaded pages and resumes from the last cursor. Changing the filter changes the query key, which resets the walk to the first page automatically — no manual `useState` cursor bookkeeping.

## Comparison: Offset vs Cursor

| Aspect | Offset Pagination | Cursor Pagination |
|--------|------------------|-------------------|
| **Performance** | Degrades with page number | Consistent |
| **Deep pages** | Very slow (scans rows) | Same speed as page 1 |
| **Page jumping** | Easy (go to page 100) | Not supported (by design) |
| **Real-time updates** | Shows duplicate/missing items | Stable — values, not positions |
| **Totals** | Needs `COUNT(*)` per request | Not provided (aggregate endpoint if ever needed) |
| **Implementation** | Simple, and wrong at scale | One shared pattern, reused everywhere |
| **Use case** | — (banned in Nodus, I7) | Every list endpoint |

**Nodus policy:** cursor pagination is the only list pattern. The offset column above exists to explain *why* — if a design asks for page numbers or totals, answer it with filters, search, and (rarely) a dedicated aggregate endpoint, not with offset mode.
