---
title: Use Parameterized Queries to Prevent SQL Injection
impact: CRITICAL
section: 6
impactDescription: Eliminates SQL injection vulnerabilities
tags: security, database, sql-injection, prisma
---

Raw SQL queries with string concatenation allow attackers to inject malicious code. Prisma Client automatically parameterizes all queries, preventing injection. **Never use string concatenation with user input.**

In Nodus there is a second, equally strict boundary: raw SQL may appear **only inside the module's `*.repository.ts`** (and `infra/`). Services and controllers never call `$queryRaw`/`$executeRaw` — they call domain-named repository methods (see `database-repository-pattern.md`). The examples below therefore live in repository files.

> **Hint**: Prefer typed Prisma Client queries (`findMany`, `create`, ...) — they are always parameterized. Reach for raw SQL only when the Prisma API cannot express the query (complex aggregations, CTEs, bulk operations), and always use the tagged-template form.

## For AI Agents

When implementing or reviewing database queries, **always** follow these steps:

### Step 1: Check for Raw SQL Usage
**Pattern to check:** Look for `$queryRawUnsafe`, `$executeRawUnsafe`, `$queryRaw`/`$executeRaw` called with a plain string variable, or any SQL outside a `*.repository.ts` file.

```typescript
// ❌ WRONG - String concatenation
const query = `SELECT * FROM users WHERE id = '${userId}'`;
await prisma.$queryRawUnsafe(query);

// ❌ WRONG - String concatenation with template literal
const query = `SELECT * FROM tasks WHERE title = '${title}' AND stage_id = '${stageId}'`;
await prisma.$executeRawUnsafe(query);

// ❌ WRONG - Pre-built string with interpolation. Prisma rejects plain strings
// in $queryRaw; the dangerous "fix" is switching to $queryRawUnsafe, which
// happily executes the concatenation. Interpolate values, never text.
const search = `SELECT * FROM users WHERE email LIKE '%${searchTerm}%'`;
await prisma.$queryRawUnsafe(search);

// ❌ WRONG - Raw SQL in a service (Nodus: Prisma only in repositories)
@Injectable()
export class TasksService {
  async search(term: string) {
    return this.prisma.$queryRaw`SELECT * FROM tasks WHERE title ILIKE ${'%' + term + '%'}`;
  }
}

// ✅ CORRECT - Tagged template (auto-parameterized), inside a repository
// tasks/tasks.repository.ts
const result = await this.prisma.$queryRaw<TaskRow[]>`
  SELECT * FROM tasks
  WHERE id = ${taskId}
`;
```

**If found:** Move the query into the module repository and convert to the tagged-template form or to a typed query.

### Step 2: Verify Parameterization of Every Variable
**File:** Any `*.repository.ts` using raw queries

```typescript
// ✅ REQUIRED: every user-controlled value is an interpolated parameter
import { Prisma } from '@prisma/client';

// Single parameter
const users = await this.prisma.$queryRaw<UserRow[]>`
  SELECT * FROM users
  WHERE email = ${email}
`;

// Multiple parameters
const results = await this.prisma.$queryRaw<TimeEntryRow[]>`
  SELECT * FROM time_entries
  WHERE user_id = ${userId}
    AND task_id = ${taskId}
    AND logged_at > ${since}
`;

// With JOIN
const tasksWithComments = await this.prisma.$queryRaw<TaskWithCountRow[]>`
  SELECT t.*, COUNT(c.id) AS comment_count
  FROM tasks t
  LEFT JOIN comments c ON c.task_id = t.id
  WHERE t.assignee_id = ${assigneeId}
  GROUP BY t.id
`;
```

### Step 3: Use Prisma Helpers for Dynamic Fragments
Interpolated values become bind parameters automatically. When the *structure* of the query must be dynamic (IN lists, optional filters, sort columns), use the dedicated helpers — never string concatenation:

```typescript
import { Prisma } from '@prisma/client';

// ✅ Prisma.join — arrays / IN clauses (every element is parameterized)
const users = await this.prisma.$queryRaw<UserRow[]>`
  SELECT * FROM users
  WHERE id IN (${Prisma.join(userIds)})
`;

// ✅ Prisma.sql — composable fragments; nested fragments stay parameterized
const statusFilter = stageId
  ? Prisma.sql`AND t.stage_id = ${stageId}`
  : Prisma.empty;

const tasks = await this.prisma.$queryRaw<TaskRow[]>`
  SELECT t.* FROM tasks t
  WHERE t.assignee_id = ${assigneeId}
  ${statusFilter}
`;

// ✅ Prisma.raw — ONLY for SQL identifiers/keywords from a hardcoded allowlist.
// Values through Prisma.raw are NOT escaped — never pass user input here.
const SORT_COLUMNS = {
  createdAt: 'created_at',
  dueAt: 'due_at',
} as const;

type SortKey = keyof typeof SORT_COLUMNS;

async function findSorted(sortBy: SortKey, sortDir: 'asc' | 'desc', limit: number) {
  const column = Prisma.raw(SORT_COLUMNS[sortBy]);            // allowlisted identifier
  const direction = Prisma.raw(sortDir === 'asc' ? 'ASC' : 'DESC');
  return this.prisma.$queryRaw<TaskRow[]>`
    SELECT * FROM tasks
    ORDER BY ${column} ${direction}
    LIMIT ${limit}
  `;
}
```

### Step 4: Check Transaction Syntax
**Interactive transaction pattern (required when later statements depend on earlier results, or when an outbox event must be written in the same transaction):**

```typescript
// ❌ WRONG - Results of one operation needed by the next, but no transaction:
const task = await this.prisma.task.create({ data: taskData });
await this.event.create({ data: { type: 'task.created', payload: { taskId: task.id } } });
//    ^ if the second write fails, the task exists without its outbox event (I9 broken)

// ✅ CORRECT - Interactive transaction; outbox event written in the same tx
await this.prisma.$transaction(async (tx) => {
  const task = await tx.task.create({ data: taskData });
  await tx.event.create({
    data: {
      type: 'task.created',
      payload: { taskId: task.id, assigneeId: task.assigneeId },
    },
  });
});
// In production code this orchestration goes through the core EventBus:
// await this.eventBus.emit(tx, 'task.created', { taskId: task.id, ... })
// which performs the same `events` insert with the passed transaction client.
```

```typescript
// ✅ ALSO VALID - Array form, for independent operations that need no logic
// between them (classic Prisma supports both forms; pick per use case)
await this.prisma.$transaction([
  this.prisma.task.update({ where: { id: taskId }, data: { stageId: doneId } }),
  this.prisma.timeEntry.create({ data: entryData }),
]);
```

### Step 5: Verify Client Extension Patterns
**File:** `infra/prisma.service.ts`

```typescript
// ✅ CORRECT: client extension for cross-cutting query behavior
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient().$extends({
  query: {
    $allOperations({ operation, args, query }) {
      // e.g. structured query logging / slow-query metrics
      const started = performance.now();
      return query(args).finally(() => {
        logger.debug({ operation, ms: performance.now() - started }, 'prisma query');
      });
    },
  },
});
```

## Quick Reference Checklist

Use this checklist when reviewing or creating database queries:

- [ ] No string concatenation in SQL queries
- [ ] Raw SQL exists only in `*.repository.ts` (never in services/controllers)
- [ ] All `$queryRaw`/`$executeRaw` calls use the tagged-template form
- [ ] No `$queryRawUnsafe`/`$executeRawUnsafe` (or: parameterized `$1` form with a code comment justifying it)
- [ ] Dynamic fragments use `Prisma.sql` / `Prisma.join` / `Prisma.empty`
- [ ] `Prisma.raw` used only with values from a hardcoded allowlist
- [ ] Dependent writes use the interactive transaction pattern
- [ ] Outbox event insert shares the mutation's transaction (I9)
- [ ] Raw results are typed with an explicit row type generic

**Incorrect:**

```typescript
// tasks/tasks.service.ts - DANGEROUS 🚨

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {} // ❌ Prisma in a service

  // ❌ String concatenation - SQL INJECTION
  async findByTitle(title: string) {
    const query = `SELECT * FROM tasks WHERE title = '${title}'`;
    return this.prisma.$queryRawUnsafe(query);
  }

  // ❌ Template literal concatenation - VULNERABLE
  async findByEmailAndAssignee(email: string, assigneeId: string) {
    const query = `SELECT * FROM users WHERE email = '${email}' AND id = '${assigneeId}'`;
    return this.prisma.$executeRawUnsafe(query);
  }

  // ❌ Concatenation "fixed" with $queryRawUnsafe - VULNERABLE
  // (passing a plain string to $queryRaw is rejected by Prisma; switching to
  //  the Unsafe variant keeps the injection instead of fixing it)
  async searchTasks(searchTerm: string) {
    const sql = `SELECT * FROM tasks WHERE title LIKE '%${searchTerm}%'`;
    return this.prisma.$queryRawUnsafe(sql);
  }

  // ❌ Sort column taken straight from the request - identifier injection
  async listSorted(sortColumn: string) {
    return this.prisma.$queryRawUnsafe(
      `SELECT * FROM tasks ORDER BY ${sortColumn} DESC LIMIT 50`,
    );
  }

  // ❌ Two dependent writes without a transaction - no outbox atomicity
  async createTask(data: CreateTaskDto) {
    const task = await this.prisma.task.create({ data });
    await this.prisma.event.create({
      data: { type: 'task.created', payload: { taskId: task.id } },
    });
    return task;
  }
}
```

**Correct:**

```typescript
// tasks/tasks.repository.ts - SAFE ✅

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma.service';

type TaskRow = {
  id: string;
  title: string;
  stage_id: string;
  assignee_id: string;
  due_at: Date | null;
  created_at: Date;
};

@Injectable()
export class TasksRepository {
  constructor(private prisma: PrismaService) {}

  // ✅ Typed query - Safest option, always preferred
  async findByAssignee(assigneeId: string) {
    return this.prisma.task.findMany({
      where: { assigneeId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  // ✅ Raw query with parameterization (tagged template)
  async findRowById(id: string) {
    const rows = await this.prisma.$queryRaw<TaskRow[]>`
      SELECT * FROM tasks
      WHERE id = ${id}
    `;
    return rows[0] ?? null;
  }

  // ✅ Multiple parameters - All auto-parameterized
  async findRowsByStatusAndAssignee(stageId: string, assigneeId: string) {
    return this.prisma.$queryRaw<TaskRow[]>`
      SELECT * FROM tasks
      WHERE stage_id = ${stageId}
        AND assignee_id = ${assigneeId}
    `;
  }

  // ✅ Parameterized LIKE query - wildcard built INSIDE the parameter
  async searchByTitle(searchTerm: string) {
    return this.prisma.$queryRaw<TaskRow[]>`
      SELECT * FROM tasks
      WHERE title ILIKE ${`%${searchTerm}%`}
    `;
  }

  // ✅ Transaction with outbox event in the same tx (I9)
  async createWithEvent(taskData: Prisma.TaskUncheckedCreateInput) {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.create({ data: taskData });
      await tx.event.create({
        data: {
          type: 'task.created',
          payload: { taskId: task.id, assigneeId: task.assigneeId },
        },
      });
      return task;
    });
  }

  // ✅ Complex JOIN with parameterization
  async getAssigneeWorkload(assigneeId: string) {
    return this.prisma.$queryRaw<{ task_id: string; title: string; minutes: bigint }[]>`
      SELECT
        t.id AS task_id,
        t.title,
        COALESCE(SUM(te.minutes), 0) AS minutes
      FROM tasks t
      LEFT JOIN time_entries te ON te.task_id = t.id
      WHERE t.assignee_id = ${assigneeId}
      GROUP BY t.id, t.title
    `;
  }

  // ✅ Execute raw with parameterization + Prisma.join for arrays
  async bulkArchive(taskIds: string[], archivedStatusId: string) {
    return this.prisma.$executeRaw`
      UPDATE tasks
      SET stage_id = ${archivedStatusId}, updated_at = NOW()
      WHERE id IN (${Prisma.join(taskIds)})
    `;
  }
}
```

## Raw Query Examples (classic Prisma)

### Basic SELECT Queries

```typescript
import { Prisma } from '@prisma/client';

// Simple WHERE
const tasks = await this.prisma.$queryRaw<TaskRow[]>`
  SELECT * FROM tasks
  WHERE stage_id = ${stageId}
    AND created_at > ${since}
`;

// IN clause with array — Prisma.join parameterizes every element
const activeUsers = await this.prisma.$queryRaw<UserRow[]>`
  SELECT * FROM users
  WHERE id IN (${Prisma.join(userIds)})
`;

// Conditional fragment — Prisma.sql / Prisma.empty compose safely
const projectFilter = projectId ? Prisma.sql`AND project_id = ${projectId}` : Prisma.empty;
const filtered = await this.prisma.$queryRaw<TaskRow[]>`
  SELECT * FROM tasks
  WHERE assignee_id = ${assigneeId}
  ${projectFilter}
`;

// ORDER BY with dynamic column — allowlist + Prisma.raw for identifiers
const SORT_COLUMNS = { createdAt: 'created_at', dueAt: 'due_at' } as const;
const column = Prisma.raw(SORT_COLUMNS[sortKey]);
const rows = await this.prisma.$queryRaw<TaskRow[]>`
  SELECT * FROM tasks
  ORDER BY ${column} DESC
  LIMIT ${limit}
`;
```

### INSERT, UPDATE, DELETE

```typescript
// INSERT with returning
const newTask = await this.prisma.$queryRaw<TaskRow[]>`
  INSERT INTO tasks (title, assignee_id, stage_id)
  VALUES (${title}, ${assigneeId}, ${stageId})
  RETURNING *
`;

// UPDATE — $executeRaw returns the affected row count
const updated = await this.prisma.$executeRaw`
  UPDATE tasks
  SET stage_id = ${newStatusId}, updated_at = NOW()
  WHERE id = ${taskId}
`;

// DELETE with returning
const deleted = await this.prisma.$queryRaw<{ id: string }[]>`
  DELETE FROM sessions
  WHERE expires_at < NOW()
  RETURNING id
`;
```

### Complex Queries

```typescript
// Aggregation
const stats = await this.prisma.$queryRaw<DailyStat[]>`
  SELECT
    DATE(logged_at) AS date,
    COUNT(*) AS entries,
    SUM(minutes) AS total_minutes
  FROM time_entries
  WHERE logged_at >= ${startDate}
    AND logged_at <= ${endDate}
  GROUP BY DATE(logged_at)
  ORDER BY date DESC
`;

// CTE (Common Table Expression) — cursor-style window over a leaderboard
const topAssignees = await this.prisma.$queryRaw<AssigneeRank[]>`
  WITH workload AS (
    SELECT
      u.id,
      u.display_name,
      COUNT(t.id) AS open_tasks,
      ROW_NUMBER() OVER (ORDER BY COUNT(t.id) DESC) AS rn
    FROM users u
    LEFT JOIN tasks t ON t.assignee_id = u.id AND t.due_at > NOW()
    GROUP BY u.id, u.display_name
  )
  SELECT * FROM workload
  WHERE rn BETWEEN ${offset + 1} AND ${offset + limit}
`;

// UNION — full-text-ish search across two aggregates
const allItems = await this.prisma.$queryRaw<SearchHit[]>`
  SELECT id, title AS label, 'task' AS type FROM tasks
  WHERE title ILIKE ${`%${search}%`}
  UNION
  SELECT id, number AS label, 'letter' AS type FROM letters
  WHERE subject ILIKE ${`%${search}%`}
`;
```

## Transaction Patterns

### Interactive Transactions

```typescript
// Single flow with a business invariant checked inside the tx
await this.prisma.$transaction(async (tx) => {
  const task = await tx.task.update({
    where: { id: taskId },
    data: { remainingMinutes: { decrement: minutes } },
  });

  if (task.remainingMinutes < 0) {
    // Throwing inside the callback rolls the whole transaction back
    throw new InvalidTaskStateException('Logged time exceeds the estimate');
  }

  await tx.timeEntry.create({
    data: { taskId, userId, minutes, loggedAt: new Date() },
  });

  // Outbox event in the same transaction (I9) — via core EventBus in services:
  // await this.eventBus.emit(tx, 'task.time_logged', { taskId, userId, minutes });
});

// Multiple related operations
await this.prisma.$transaction(async (tx) => {
  const task = await tx.task.create({
    data: { projectId, title, assigneeId, stageId: defaultStatusId },
  });

  await tx.taskWatcher.createMany({
    data: watcherIds.map((userId) => ({ taskId: task.id, userId })),
  });

  if (sourceLetterId) {
    await tx.letter.update({
      where: { id: sourceLetterId },
      data: { linkedTaskId: task.id },
    });
  }

  return task;
});
```

### Transaction Options

```typescript
await this.prisma.$transaction(
  async (tx) => {
    // Operations here
  },
  {
    maxWait: 5000,   // Max wait to acquire a transaction slot (default 2000ms)
    timeout: 10000,  // Max transaction run time (default 5000ms)
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  },
);
```

Keep transactions short: no HTTP calls, no BullMQ dispatches, no `await` on anything but `tx.*` inside the callback — a long-lived interactive transaction holds a connection from the pool and blocks the outbox row visibility anyway.

## Client Extensions

### Logging Extension

```typescript
// infra/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({ log: ['warn', 'error'] });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  // Slow-query visibility without leaking parameter values into logs
  withQueryMetrics() {
    // Capture the logger — `this` inside the extension callback is NOT the service
    const logger = this.logger;
    return this.$extends({
      query: {
        async $allOperations({ model, operation, args, query }) {
          const started = performance.now();
          try {
            return await query(args);
          } finally {
            const ms = performance.now() - started;
            if (ms > 200) {
              // log the operation shape, never args (may contain PII)
              logger.warn(`Slow query: ${model}.${operation} took ${ms.toFixed(0)}ms`);
            }
          }
        },
      },
    });
  }
}
```

### Model Extensions

```typescript
// Extended client with reusable domain-shaped helpers.
// Prefer a real repository class in module code; model extensions are for
// genuinely cross-module, infra-level conveniences.
const prisma = new PrismaClient().$extends({
  model: {
    user: {
      async findByEmail(email: string) {
        return prisma.user.findUnique({ where: { email } });
      },
      async findActive() {
        return prisma.user.findMany({ where: { deactivatedAt: null } });
      },
    },
    task: {
      async countOpenByAssignee(assigneeId: string) {
        return prisma.task.count({
          where: { assigneeId, completedAt: null },
        });
      },
    },
  },
});

// Usage
const user = await prisma.user.findByEmail('user@nodus.by');
const openCount = await prisma.task.countOpenByAssignee('user-123');
```

## Best Practices Summary

| Practice | Why |
|----------|-----|
| Use typed queries | Type-safe, auto-parameterized |
| Keep raw SQL in repositories | Single data-access point; services stay Prisma-free |
| Use the tagged-template form | Auto-parameterizes every interpolated value |
| `Prisma.join` for arrays, `Prisma.sql`/`Prisma.empty` for fragments | Dynamic structure without concatenation |
| `Prisma.raw` only from allowlists | Identifiers can't be bind parameters — whitelist them |
| Never concatenate strings | Prevents SQL injection |
| Interactive transactions for dependent writes | Rollback on business-rule failure |
| Outbox insert inside the same transaction | I9: entity change and its event commit atomically |
