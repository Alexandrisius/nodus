---
title: Organize Code by Feature Modules
impact: HIGH
section: 3
impactDescription: Improves scalability and maintainability
tags: architecture, modules, structure, scalability, isolation
---

## Organize Code by Feature Modules

Flat controller/service structure becomes unmaintainable at scale. NestJS modules enforce separation of concerns by feature. **One module per business domain, with a fixed internal layout and hard isolation boundaries.**

> **Hint**: Every backend module lives in `apps/api/src/modules/<name>/` and follows the same four-layer layout (controller → service → repository → Prisma). Feature modules never import each other — they collaborate through domain events and `@nodus/contracts` only (I3, I6). The frontend mirrors each module in `apps/web/src/features/<name>/`.

**Incorrect:**

```
apps/api/src/
  users.controller.ts
  users.service.ts
  auth.controller.ts
  auth.service.ts
  tasks.controller.ts   // Chaos!
  tasks.service.ts
  correspondence.controller.ts
  correspondence.service.ts
```

**Correct:**

```
apps/api/src/
  core/                       # cross-cutting mechanisms (guards, interceptors, events, errors)
    events/
    guards/
    interceptors/
  infra/                      # PrismaService, Redis, MinIO clients — the only other place Prisma lives
    prisma/
  modules/
    users/
      users.module.ts         # wiring only, no logic
      users.controller.ts     # HTTP only: routes, zod pipe, OpenAPI decorators
      users.service.ts        # business logic, transactions, orchestration
      users.repository.ts     # ONLY access point of this module to its tables (Prisma)
      dto/                    # request/response DTO — types inferred from @nodus/contracts zod schemas
      events/                 # published-event emitters' helpers + handlers of foreign events
      README.md               # purpose, contracts, events, limits
    tasks/
      tasks.module.ts
      tasks.controller.ts
      tasks.service.ts
      tasks.repository.ts
      dto/
      events/
        resolution-issued.handler.ts
      README.md
    correspondence/
      ...
apps/web/src/features/        # frontend mirror of each module (api/, components/, pages/, model/)
```

## Module Configuration Example

```typescript
// apps/api/src/modules/users/users.module.ts
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';

@Module({
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  // ✅ Feature modules export nothing by default — nobody may import them (I3)
})
export class UsersModule {}
```

Note what is *not* here: no `imports: [OtherFeatureModule]`, no `exports: [UsersService]`. Cross-module access to a feature module's service is forbidden — see "Module Communication Patterns" below.

## Shared Modules: Core and Infra Only

The only modules a feature module may import are the platform-level ones — Prisma, Redis, events, configuration:

```typescript
// apps/api/src/infra/prisma/prisma.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global() // ✅ Infra is global: every module's repository injects PrismaService
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

```typescript
// apps/api/src/modules/users/users.repository.ts
// ✅ The repository is the only module file that sees the Prisma client
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }
}
```

## Global Modules

Use `@Global()` sparingly — only for truly universal platform services (Prisma, config, core events). Never make a feature module global: that silently defeats isolation (I6) and makes dependencies invisible.

```typescript
// ✅ Legitimate global: configuration, loaded once
import { Global, Module } from '@nestjs/common';
import { ConfigService } from './config.service';

@Global()
@Module({
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}
```

```typescript
// ❌ WRONG - a feature module gone global; every module can now inject it invisibly
@Global()
@Module({ providers: [TasksService], exports: [TasksService] })
export class TasksModule {}
```

## Dynamic Modules

Create configurable platform modules with `register()` / `forRoot()` — the standard pattern for extension points whose implementations are chosen at bootstrap (I13: interface now, implementation later):

```typescript
// apps/api/src/infra/storage/storage.module.ts
import { DynamicModule, Module } from '@nestjs/common';
import { STORAGE_DRIVER, StorageDriver } from './storage-driver.interface';
import { MinioStorageDriver } from './minio-storage.driver';

export interface StorageModuleOptions {
  driver: 'minio' | 'fs';
  endpoint?: string;
  bucket?: string;
}

@Module({})
export class StorageModule {
  static register(options: StorageModuleOptions): DynamicModule {
    return {
      module: StorageModule,
      providers: [
        { provide: 'STORAGE_OPTIONS', useValue: options },
        {
          provide: STORAGE_DRIVER,
          useFactory: (opts: StorageModuleOptions): StorageDriver =>
            opts.driver === 'minio' ? new MinioStorageDriver(opts) : new FsStorageDriver(opts),
          inject: ['STORAGE_OPTIONS'],
        },
      ],
      exports: [STORAGE_DRIVER],
    };
  }
}
```

```typescript
// apps/api/src/app.module.ts — consumers bind against the interface, not the driver
@Module({
  imports: [
    StorageModule.register({ driver: 'minio', endpoint: process.env.MINIO_ENDPOINT, bucket: 'nodus' }),
  ],
})
export class AppModule {}
```

## Module Dependencies: Feature Modules Have None

A feature module must never appear in another feature module's `imports`. The original NestJS pattern of wiring dependencies through imports is, for feature modules, a Nodus anti-pattern:

```typescript
// ❌ WRONG - feature-to-feature imports: tight coupling, I3/I6 violation,
//    ESLint-boundaries rejects this at lint time
@Module({
  imports: [
    UsersModule,          // "need UsersService for validation"
    TasksModule,          // "need TasksService to create a task"
    NotificationsModule,  // "need NotificationService"
  ],
  controllers: [CorrespondenceController],
  providers: [CorrespondenceService, CorrespondenceRepository],
})
export class CorrespondenceModule {}
```

```typescript
// ✅ CORRECT - the module depends on platform services only;
//    collaboration happens through outbox events (see architecture-event-driven)
@Module({
  controllers: [CorrespondenceController],
  providers: [
    CorrespondenceService,
    CorrespondenceRepository,
    // handlers of foreign events this module subscribes to:
    TaskCompletedHandler,
  ],
})
export class CorrespondenceModule {}
```

If module A genuinely needs **data** owned by module B, the options are: subscribe to B's events and keep a local projection, or read through B's public API contract — never through B's service or repository, and never through B's tables (a module's repository touches only its own tables).

## Complete Feature Module Example

A full module on the Nodus stack: zod schema in contracts → thin controller with a zod pipe → service with business rules and an outbox event → repository with Prisma.

**File:** `packages/contracts/src/user/user.schemas.ts`

```typescript
import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  name: z.string().min(1),
  departmentId: z.string().uuid().nullable().optional(),
});
export type CreateUserDto = z.infer<typeof createUserSchema>;

export const userResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  createdAt: z.string().datetime(),
});
export type UserResponseDto = z.infer<typeof userResponseSchema>;
```

**File:** `apps/api/src/core/pipes/zod-validation.pipe.ts`

```typescript
// ✅ One core pipe validates every boundary payload against a contracts schema (I7)
import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';
import { ErrorCode } from '@nodus/contracts';
import { DomainException } from '../errors/domain-exception';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      // ✅ Unified error format { code, message, details?, traceId } — the global filter adds traceId
      throw new DomainException(ErrorCode.VALIDATION_FAILED, 'Validation failed', {
        issues: result.error.issues,
      });
    }
    return result.data;
  }
}
```

**File:** `apps/api/src/modules/users/users.controller.ts`

```typescript
// ✅ Thin controller: route → zod pipe → service → response. No business ifs.
import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  CreateUserDto,
  Permission,
  createUserSchema,
  userFilterSchema,
  UserFilterDto,
} from '@nodus/contracts';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { PermissionGuard } from '../../core/guards/permission.guard';
import { RequirePermissions } from '../../core/guards/require-permissions.decorator';
import { UsersService } from './users.service';

@Controller('users') // global prefix /api/v1 is applied at bootstrap
@UseGuards(PermissionGuard) // ✅ RBAC at the API guard level, not only in UI (I8)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @RequirePermissions(Permission.USER_MANAGE)
  create(@Body(new ZodValidationPipe(createUserSchema)) dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get()
  findAll(@Query(new ZodValidationPipe(userFilterSchema)) filter: UserFilterDto) {
    // ✅ Cursor pagination: ?cursor=&limit= (limit ≤ 100, default 50) → { items, nextCursor }
    return this.usersService.findAll(filter);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }
}
```

**File:** `apps/api/src/modules/users/users.service.ts`

```typescript
// ✅ Business logic + transactions + orchestration. No HTTP, no Prisma client.
import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { CreateUserDto, DIRECTORY_EVENTS, ErrorCode, UserFilterDto } from '@nodus/contracts';
import { TransactionRunner } from '../../core/database/transaction-runner';
import { EventBus } from '../../core/events/event-bus';
import { DomainException } from '../../core/errors/domain-exception';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(
    private readonly txRunner: TransactionRunner,
    private readonly users: UsersRepository,
    private readonly eventBus: EventBus,
  ) {}

  async create(dto: CreateUserDto) {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) {
      // ✅ Domain exception with a contracts error code; the global filter maps it to HTTP
      throw new DomainException(ErrorCode.CONFLICT, 'Email is already registered');
    }

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });

    return this.txRunner.run(async (tx) => {
      const user = await this.users.create(tx, {
        email: dto.email,
        name: dto.name,
        passwordHash,
        departmentId: dto.departmentId ?? null,
      });

      // ✅ Welcome email, profile bootstrap, search indexing are subscribers, not dependencies
      await this.eventBus.emit(tx, DIRECTORY_EVENTS.USER_CREATED, {
        userId: user.id,
        email: user.email,
        name: user.name,
      });

      return user;
    });
  }

  findAll(filter: UserFilterDto) {
    return this.users.findPage(filter); // repository owns cursor logic and deterministic sort
  }

  async findOne(id: string) {
    const user = await this.users.findById(id);
    if (!user) throw new DomainException(ErrorCode.NOT_FOUND, 'User not found');
    return user;
  }
}
```

**File:** `apps/api/src/modules/users/users.repository.ts`

```typescript
// ✅ The ONLY file in the module that touches Prisma. Methods speak domain language.
import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { UserFilterDto } from '@nodus/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  create(tx: Prisma.TransactionClient, data: Prisma.UserCreateInput): Promise<User> {
    return tx.user.create({ data });
  }

  async findPage(filter: UserFilterDto) {
    const limit = filter.limit; // already defaulted to 50 and capped at 100 by the schema
    const rows = await this.prisma.user.findMany({
      take: limit + 1, // one extra row tells us whether a next page exists
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], // ✅ deterministic sort — mandatory with cursors
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      items,
      nextCursor: hasMore ? items[items.length - 1].id : null, // ✅ { items, nextCursor } shape
    };
  }
}
```

**File:** `apps/api/src/modules/users/users.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';

@Module({
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
})
export class UsersModule {}
```

Every module also carries a `README.md` (purpose, owned tables, published/subscribed events, contracts, limits) — updated in the same commit as any behavior change (I12).

## Barrel Exports: Module Boundary Only

```typescript
// ✅ ACCEPTABLE - a boundary barrel for the module's public surface
// apps/api/src/modules/users/index.ts
export * from './users.module';
```

```typescript
// ❌ WRONG - re-exporting internals invites deep imports around the boundary
export * from './users.service';
export * from './users.repository';
export * from './dto/create-user.dto'; // DTO types come from @nodus/contracts, not from the module
```

Deep imports like `import { UsersService } from '../users/users.service'` are forbidden regardless of barrels — ESLint-boundaries (I6) rejects them.

## Module Best Practices

| Practice | Description | Why |
|----------|-------------|-----|
| One module per business domain | Each domain gets `modules/<name>/` with the fixed four-layer layout | Clear separation of concerns; agents navigate without guessing |
| Repository pattern mandatory | Prisma only in `*.repository.ts` (and `infra/`) | Testable services (mock the repository), one point for indexes/soft-delete |
| No cross-module imports | Collaborate via events + `@nodus/contracts` | Loose coupling, ESLint-boundaries enforcement (I3, I6) |
| No exports from feature modules | Nothing to import = nothing to couple to | Prevents accidental public APIs |
| DTOs from contracts zod schemas | One schema serves frontend forms and backend validation | No duplicated drift between client and server (I7) |
| Avoid circular dependencies | Module A importing B while B imports A | Initialization failures, unmappable dependency graph |
| Thin controllers, HTTP-free services | Controller = pipe + call; service = rules + transactions | Business logic stays testable without an HTTP harness |
| README per module, updated with code | Purpose, tables, events, contracts, limits | Stale docs are a bug (I12) |

## Testing Modules

Test services in isolation with a mocked repository and EventBus (Vitest); compile the module only in integration smoke tests:

```typescript
// apps/api/src/modules/users/users.service.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DIRECTORY_EVENTS } from '@nodus/contracts';
import { UsersService } from './users.service';

describe('UsersService', () => {
  const users = { findByEmail: vi.fn(), create: vi.fn() };
  const eventBus = { emit: vi.fn() };
  const txRunner = { run: vi.fn((cb: (tx: unknown) => unknown) => cb('TX')) };

  let service: UsersService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new UsersService(txRunner as never, users as never, eventBus as never);
  });

  it('creates a user and emits directory.user.created in the same transaction', async () => {
    users.findByEmail.mockResolvedValue(null);
    users.create.mockResolvedValue({ id: 'u1', email: 'a@nodus.by', name: 'A' });

    const user = await service.create({ email: 'a@nodus.by', password: 'secret123456', name: 'A' });

    expect(users.create).toHaveBeenCalledWith(
      'TX',
      expect.objectContaining({ email: 'a@nodus.by', passwordHash: expect.any(String) }),
    );
    expect(eventBus.emit).toHaveBeenCalledWith('TX', DIRECTORY_EVENTS.USER_CREATED, {
      userId: 'u1',
      email: 'a@nodus.by',
      name: 'A',
    });
    expect(user.id).toBe('u1');
  });

  it('rejects a duplicate email with CONFLICT', async () => {
    users.findByEmail.mockResolvedValue({ id: 'u1' });

    await expect(
      service.create({ email: 'a@nodus.by', password: 'secret123456', name: 'A' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(users.create).not.toHaveBeenCalled();
  });
});
```

```typescript
// apps/api/src/modules/users/users.module.test.ts — smoke test, runs under Vitest
import { describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { UsersModule } from './users.module';
import { UsersService } from './users.service';

describe('UsersModule', () => {
  it('compiles with its providers', async () => {
    const module = await Test.createTestingModule({ imports: [UsersModule] }).compile();

    expect(module).toBeDefined();
    expect(module.get(UsersService)).toBeInstanceOf(UsersService);
  });
});
```

## Module Communication Patterns

### Direct Import (Tight Coupling) — Forbidden

```typescript
// ❌ WRONG - see "Module Dependencies" above: feature-to-feature imports violate I3/I6
@Module({
  imports: [UsersModule],
  providers: [TasksService],
})
export class TasksModule {}
```

### Event-Based (Loose Coupling) — Required

```typescript
// ✅ Publisher side: outbox event in the mutation's transaction
// apps/api/src/modules/tasks/tasks.service.ts
await this.txRunner.run(async (tx) => {
  const task = await this.tasks.create(tx, data);
  await this.eventBus.emit(tx, TASK_EVENTS.CREATED, {
    taskId: task.id,
    title: task.title,
    assigneeId: task.assigneeId,
    creatorId: task.creatorId,
    source: 'manual',
    sourceId: null,
  });
});
```

```typescript
// ✅ Subscriber side: idempotent handler in the subscriber's events/ directory
// apps/api/src/modules/notifications/events/task-created.handler.ts
@Injectable()
export class TaskCreatedNotificationHandler {
  static readonly eventType = TASK_EVENTS.CREATED;

  async handle(envelope: EventEnvelope<TaskCreatedPayload>): Promise<void> {
    // dedupe by envelope.id, then react — see architecture-event-driven for the full pattern
  }
}
```

The full contract — transactional outbox, payload schemas, idempotency, sagas, versioning — is specified in `architecture-event-driven`.

**Sources:**
- `docs/architecture/patterns.md` (module layout, repository pattern, contracts)
- `docs/architecture/invariants.md` (I3, I6, I7, I8, I12, I13)
- `docs/architecture/repository-structure.md` (monorepo layout)
