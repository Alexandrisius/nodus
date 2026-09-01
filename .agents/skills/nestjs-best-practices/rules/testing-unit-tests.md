---
title: Write Comprehensive Unit Tests
section: 10
impact: MEDIUM
impactDescription: Catches bugs early and enables safe refactoring
tags: testing, vitest, quality, unit
---

## Write Comprehensive Unit Tests

Untested code leads to regressions and production bugs. NestJS + Vitest provides full testing support for services, pipes, and guards. **New business logic = unit test in the same commit (DoD).** Aim for 80%+ coverage on business logic.

Conventions (from `docs/architecture/patterns.md`):

- The test file lives **next to the code**: `<entity>.test.ts` (e.g. `tasks.service.test.ts` beside `tasks.service.ts`).
- AAA structure: arrange / act / assert.
- Services are tested with a **mocked repository** — the service never knows the Prisma client, so no Prisma mocking is ever needed in a service test.
- Repositories, transactional outbox, and idempotency are covered by **integration tests against a real test database** (docker) — do not unit-test Prisma itself.

### Vitest setup for NestJS

esbuild does not emit decorator metadata, which NestJS DI relies on. Use `unplugin-swc` in the Vitest config:

```typescript
// apps/api/vitest.config.ts ✅
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        target: 'esnext',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    environment: 'node',
    coverage: { provider: 'v8' },
  },
});
```

Examples below import `describe/it/expect/vi` explicitly from `vitest` (no `globals: true` needed).

**Incorrect (no tests):**

```typescript
// tasks.service.ts — no tasks.service.test.ts anywhere 🚨
@Injectable()
export class TasksService {
  constructor(private readonly tasks: TasksRepository) {}

  async complete(id: string, actorId: string) {
    const task = await this.tasks.findById(id);
    if (!task) {
      throw new DomainException(ErrorCode.NOT_FOUND, 'Task not found');
    }
    return this.tasks.markCompleted(id, actorId);  // untested business rule
  }
}
```

**Correct (full test suite):**

```typescript
// tasks.service.test.ts ✅
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { DomainException } from '../../core/errors/domain-exception';
import { TasksService } from './tasks.service';
import { TasksRepository } from './tasks.repository';

describe('TasksService', () => {
  let service: TasksService;
  let tasks: {
    findById: ReturnType<typeof vi.fn>;
    markCompleted: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    tasks = { findById: vi.fn(), markCompleted: vi.fn() };

    const module = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: TasksRepository, useValue: tasks },
      ],
    }).compile();

    service = module.get(TasksService);
  });

  it('completes an open task', async () => {
    // arrange
    const task = { id: 't1', title: 'Prepare drawings' };
    tasks.findById.mockResolvedValue(task);
    tasks.markCompleted.mockResolvedValue({ ...task, completedAt: new Date() });

    // act
    const result = await service.complete('t1', 'u1');

    // assert
    expect(result.completedAt).toBeDefined();
    expect(tasks.markCompleted).toHaveBeenCalledWith('t1', 'u1');
  });

  it('throws a domain exception when the task does not exist', async () => {
    tasks.findById.mockResolvedValue(null);

    await expect(service.complete('missing', 'u1')).rejects.toBeInstanceOf(DomainException);
    expect(tasks.markCompleted).not.toHaveBeenCalled();
  });
});
```

**Notes:**

- `vi.fn()` creates a standalone mock; `vi.spyOn(obj, 'method')` wraps an existing method. `mockResolvedValue`, `mockRejectedValue`, `mockImplementation` work the same as in Jest.
- Mock the repository at the DI level (`{ provide: TasksRepository, useValue: ... }`) — never import `@prisma/client` in a service test.
- If the service emits domain events, provide a mock `EventBus` the same way and assert `emit` was called with the transaction handle, the event name (`task.created`), and the minimal payload.
- Assert on **calls and outcomes**, not on implementation details; one behavior per `it`.
- Pipes and pure helpers need no Nest container — instantiate them directly (`new ParseIntPipe()`), see `validation-custom-pipes.md`.
- Run with `vitest run` inside `apps/api` (the workspace `test` script wraps it once the repo skeleton lands).
