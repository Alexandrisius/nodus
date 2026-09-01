---
title: Single Responsibility - Separate Controller and Service
section: 3
impact: HIGH
impactDescription: Makes testing and maintenance easier
tags: architecture, separation, testing, SRP, repository-pattern, eventbus, outbox
---

Fat controllers mix HTTP concerns with business logic, making unit testing impossible. Controllers should only parse HTTP requests and delegate. **Controllers are thin, services are smart.**

> **Hint**: Controllers handle HTTP-specific concerns (routing, zod validation via pipes, status codes, headers). Services handle business logic (calculations, workflows, transactions, domain events). Repositories are the only place Prisma is called. This separation makes all three layers independently testable.

## Controller vs Service vs Repository Responsibilities

| Controllers (HTTP Layer) | Services (Business Layer) | Repositories (Data Layer) |
|--------------------------|---------------------------|---------------------------|
| Parse request bodies | Execute business logic | Prisma queries — the ONLY place Prisma is used |
| Validate with zod pipes (`@nodus/contracts` schemas) | Perform calculations | Entity persistence |
| Return HTTP status codes | Transform data | Cursor pagination |
| Handle routing | Manage transactions (via `TransactionRunner`) | Indices / soft-delete conventions |
| Set headers/cookies | Emit domain events (outbox, in-transaction) | |
| Upload/download files | Enforce business rules | |

**Incorrect:**

```typescript
@Controller('letters')
export class LettersController {
  constructor(
    private repository: LettersRepository,
    private tasksService: TasksService,
  ) {}

  @Post()
  async register(@Body() data: any) {
    // 🚨 Validation logic (belongs in a zod schema at the boundary)
    if (!data.senderNumber || !this.isValidSenderNumber(data.senderNumber)) {
      throw new BadRequestException('Invalid sender number');
    }

    // 🚨 Business logic - duplicate check
    const duplicate = await this.repository.findBySenderNumber(data.sender, data.senderNumber);
    if (duplicate) {
      throw new BadRequestException('Letter already registered');
    }

    // 🚨 Business logic - calculating the response deadline
    const responseDueAt = new Date(data.receivedAt);
    responseDueAt.setDate(responseDueAt.getDate() + 30);

    // 🚨 Data access logic
    const letter = await this.repository.save({
      ...data,
      responseDueAt,
    });

    // 🚨 Cross-module call (other modules are reached via events, not direct calls — I3)
    await this.tasksService.createResolutionTask(letter.id);

    return letter;
  }

  private isValidSenderNumber(senderNumber: string): boolean {
    return /^\d+(-[\d/]+)?$/.test(senderNumber);
  }
}
```

**Problems:**
- Cannot test business logic without HTTP context
- Cannot reuse business logic in other contexts (CLI, WebSocket gateway, BullMQ workers)
- Difficult to mock dependencies for testing
- Changes to business logic require HTTP layer changes
- Direct cross-module call violates module isolation (I3) — use domain events instead

**Correct:**

DTOs and query schemas live in `packages/contracts` — one zod schema shared by front and back:

```typescript
// packages/contracts/correspondence/register-letter.ts
import { z } from 'zod';

export const registerLetterSchema = z.object({
  sender: z.string().min(1).max(300),
  senderNumber: z.string().min(1).max(50), // the sender's own reference number
  receivedAt: z.string().datetime(),       // UTC ISO 8601
  subject: z.string().min(1).max(500),
  body: z.string().optional(),
});

export type RegisterLetterDto = z.infer<typeof registerLetterSchema>;

export const updateLetterSchema = registerLetterSchema.partial();

export type UpdateLetterDto = z.infer<typeof updateLetterSchema>;

export const listLettersQuerySchema = z.object({
  // ✅ Letter type is a fixed system constant; business lists would be
  //    dictionary IDs, never hardcoded enums in module code (I15)
  type: z.enum(['incoming', 'outgoing']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListLettersQuery = z.infer<typeof listLettersQuerySchema>;
```

```typescript
// correspondence/letters.controller.ts
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  registerLetterSchema,
  updateLetterSchema,
  listLettersQuerySchema,
  type RegisterLetterDto,
  type UpdateLetterDto,
  type ListLettersQuery,
} from '@nodus/contracts';

@Controller('letters')
export class LettersController {
  constructor(private lettersService: LettersService) {}

  @Post()
  register(
    // ✅ Only handles HTTP concerns; validation is the zod pipe's job
    @Body(new ZodValidationPipe(registerLetterSchema)) dto: RegisterLetterDto,
    @GetUser() user: AuthUser,
  ) {
    return this.lettersService.register(dto, user.id);
  }

  @Get()
  findAll(
    @Query(new ZodValidationPipe(listLettersQuerySchema)) query: ListLettersQuery,
  ) {
    // ✅ Cursor pagination: returns { items, nextCursor } — never offset/page
    return this.lettersService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.lettersService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateLetterSchema)) dto: UpdateLetterDto,
  ) {
    return this.lettersService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.lettersService.remove(id);
  }
}

// correspondence/letters.service.ts
@Injectable()
export class LettersService {
  constructor(
    private lettersRepository: LettersRepository,
    private txRunner: TransactionRunner, // core: wraps prisma.$transaction
    private eventBus: EventBus,          // core: writes to the outbox in the same transaction
  ) {}

  async register(dto: RegisterLetterDto, actorId: string) {
    // ✅ Business logic: the same sender number must not be registered twice
    const duplicate = await this.lettersRepository.findBySenderNumber(dto.sender, dto.senderNumber);
    if (duplicate) {
      // ✅ Domain exception with a code from @nodus/contracts;
      //    the global exception filter maps it to { code, message, details?, traceId }
      throw new DomainException(ErrorCode.CONFLICT, {
        details: { existingLetterId: duplicate.id },
      });
    }

    // ✅ Business logic: calculate the response deadline
    const responseDueAt = this.calculateResponseDueAt(dto.receivedAt);

    // ✅ Business logic: register the letter + emit event atomically.
    //    The event row is written to the `events` outbox table in the SAME
    //    transaction — a crash can never lose the event or publish a phantom one (I9).
    const letter = await this.txRunner.run(async (tx) => {
      const created = await this.lettersRepository.create(
        { ...dto, responseDueAt, registeredById: actorId },
        tx,
      );

      await this.eventBus.emit(tx, 'correspondence.letter_registered', {
        letterId: created.id,
        registrationNumber: created.registrationNumber,
        responseDueAt: created.responseDueAt,
        registeredBy: actorId,
      });

      return created;
    });

    // ✅ No direct call into the tasks module — when a resolution is issued,
    //    `correspondence.resolution_issued` is emitted and the tasks module
    //    reacts on its own by creating the поручение.
    return letter;
  }

  private calculateResponseDueAt(receivedAt: string): string {
    // Regulations: 30 calendar days to answer an incoming letter
    const due = new Date(receivedAt);
    due.setUTCDate(due.getUTCDate() + 30);
    return due.toISOString();
  }

  findAll(query: ListLettersQuery) {
    return this.lettersRepository.findPage(query); // domain-language method
  }

  findOne(id: string) {
    return this.lettersRepository.findById(id);
  }

  update(id: string, dto: UpdateLetterDto) {
    return this.lettersRepository.update(id, dto);
  }

  remove(id: string) {
    return this.lettersRepository.archive(id); // deletes are archival (I15)
  }
}
```

## Controller-Specific Concerns

Controllers SHOULD handle HTTP-specific details. With the Fastify adapter, `@Res()` gives you a `FastifyReply` — prefer `passthrough` mode so Nest still serializes the returned value:

```typescript
import type { FastifyReply, FastifyRequest } from 'fastify';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)  // ✅ HTTP status codes
  async create(
    @Body(new ZodValidationPipe(createUserSchema)) dto: CreateUserDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const user = await this.usersService.create(dto);

    // ✅ Set headers via the Fastify reply
    reply.header('X-Resource-ID', user.id);

    // ✅ Return the plain DTO. Successful responses are NEVER wrapped in
    //    { success, data } — only errors have a fixed shape
    //    ({ code, message, details?, traceId }, built by the global filter).
    return user;
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')  // ✅ Content negotiation
  async export(@Res() reply: FastifyReply) {
    // ✅ Full @Res() mode (no passthrough) when streaming the body yourself
    const stream = await this.usersService.exportToCsvStream();
    reply.send(stream);
  }

  @Post('import')
  async import(@Req() req: FastifyRequest) {
    // ✅ File upload handling. NOTE: Nest's FileInterceptor is Express/multer-only.
    //    With the Fastify adapter we use @fastify/multipart
    //    (registered once in main.ts: `await app.register(multipart)`).
    const file = await req.file({ limits: { fileSize: 25 * 1024 * 1024 } });
    if (!file) {
      throw new BadRequestException('File is required');
    }
    // file.file is a stream — the service pipes it to MinIO, it is never
    // buffered whole in the HTTP layer.
    return this.usersService.processImport(file);
  }

  @Get()
  async findAll(
    // ✅ Query param parsing + type coercion via zod
    @Query(new ZodValidationPipe(listUsersQuerySchema)) query: ListUsersQuery,
  ) {
    // query.limit is already a number, ≤ 100, default 50
    return this.usersService.findPage(query);
  }
}
```

## Service Layer Best Practices

### Keep Services Pure Business Logic

```typescript
// tasks/tasks.service.ts
@Injectable()
export class TasksService {
  constructor(
    private tasksRepository: TasksRepository,
    private workflowStages: WorkflowStagesRepository, // dictionaries, not enums
    private txRunner: TransactionRunner,
    private eventBus: EventBus,
  ) {}

  async approve(taskId: string, actorId: string) {
    // ✅ Business logic: retrieve the aggregate
    const task = await this.tasksRepository.findById(taskId);
    if (!task) {
      throw new DomainException(ErrorCode.NOT_FOUND, { details: { taskId } });
    }

    // ✅ Business logic: stage checks go through the dictionaries /
    //    WorkflowStage table (I15) — never a hardcoded enum in module code.
    const inReview = await this.workflowStages.findByCode('task.in_review');
    if (task.stageId !== inReview.id) {
      throw new DomainException(ErrorCode.TASK_INVALID_STAGE_TRANSITION, {
        details: { stageId: task.stageId, expected: inReview.id },
      });
    }

    const approvedStage = await this.workflowStages.findByCode('task.approved');

    // ✅ Business logic: transition + audit-relevant event, atomically
    return this.txRunner.run(async (tx) => {
      const updated = await this.tasksRepository.setStage(
        taskId,
        approvedStage.id,
        tx,
      );

      await this.eventBus.emit(tx, 'task.stage_changed', {
        taskId: updated.id,
        fromStageId: inReview.id,
        toStageId: approvedStage.id,
        changedBy: actorId,
        changedAt: new Date().toISOString(), // UTC ISO 8601 everywhere
      });

      return updated;
    });
  }
}
```

### Use Domain Events for Decoupling (EventBus + transactional outbox)

Cross-module communication is events-only (I3); every domain event is persisted to the `events` outbox table in the same DB transaction as the state change (I9), then fanned out via Redis Streams. Delivery is at-least-once, so handlers MUST be idempotent. Event names are `module.action` with the owning module in singular (`task.created`, `task.stage_changed`) — only names from the api-conventions catalog; a new event is added to the catalog first.

```typescript
// tasks/tasks.service.ts
@Injectable()
export class TasksService {
  constructor(
    private tasksRepository: TasksRepository,
    private txRunner: TransactionRunner,
    private eventBus: EventBus,
  ) {}

  async create(dto: CreateTaskDto, actorId: string) {
    return this.txRunner.run(async (tx) => {
      const task = await this.tasksRepository.create(dto, tx);

      // ✅ Outbox write in the SAME transaction — no direct call into the
      //    notifications module, no in-process emitter that can lose events
      //    on crash or duplicate them on retry.
      await this.eventBus.emit(tx, 'task.created', {
        taskId: task.id,
        assigneeId: task.assigneeId,
        createdBy: actorId,
      });

      return task;
    });
  }
}

// notifications/events/task-created.handler.ts — subscriber module
@Injectable()
export class TaskCreatedHandler {
  // ✅ Declarative subscription: core registers handlers by eventType at
  //    bootstrap — no @OnEvent-style decorators.
  static readonly eventType = 'task.created';

  constructor(
    private notificationsService: NotificationsService,
    private notificationsRepository: NotificationsRepository,
  ) {}

  async handle(event: DomainEvent<TaskCreatedPayload>) {
    // ✅ Idempotent handler: Redis Streams delivery is at-least-once,
    //    so the same event.id may arrive again after a crash/retry.
    if (await this.notificationsRepository.existsBySourceEventId(event.id)) {
      return;
    }
    await this.notificationsService.notifyAssignee(event.payload);
  }
}
```

## Testing Benefits

### Testing Controllers (HTTP Layer)

```typescript
// users/users.controller.test.ts — unit test next to the code (Vitest)
import { describe, it, expect, vi, type Mocked } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let service: Mocked<UsersService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: {
            create: vi.fn(),
            findPage: vi.fn(),
            findOne: vi.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    service = module.get(UsersService);
  });

  it('should create a user', async () => {
    const createUserDto: CreateUserDto = {
      email: 'test@example.com',
      password: 'supersecret12',
      name: 'Test User',
    };

    const expectedUser = { id: '1', email: createUserDto.email, name: createUserDto.name };
    service.create.mockResolvedValue(expectedUser);

    await expect(controller.create(createUserDto)).resolves.toEqual(expectedUser);
    expect(service.create).toHaveBeenCalledWith(createUserDto);
  });
});
```

### Testing Services (Business Logic)

The service never sees Prisma — mock the repository with `vi.fn()` and test pure business rules:

```typescript
// correspondence/letters.service.test.ts
import { describe, it, expect, vi, type Mocked } from 'vitest';
import { LettersService } from './letters.service';
import { LettersRepository } from './letters.repository';

describe('LettersService', () => {
  let service: LettersService;
  let lettersRepository: Mocked<LettersRepository>;

  beforeEach(() => {
    lettersRepository = { create: vi.fn(), findBySenderNumber: vi.fn() } as unknown as Mocked<LettersRepository>;
    // TransactionRunner/EventBus fakes: run() just runs the callback,
    // emit() is a vi.fn() we can assert on.
    const txRunner = { run: vi.fn((cb) => cb('tx')) };
    const eventBus = { emit: vi.fn() };
    service = new LettersService(lettersRepository, txRunner, eventBus);
  });

  it('should calculate the response deadline as 30 calendar days', () => {
    const dueAt = service['calculateResponseDueAt']('2025-03-01T10:00:00.000Z');

    expect(dueAt).toBe('2025-03-31T10:00:00.000Z');
  });

  it('should reject a duplicate letter', async () => {
    lettersRepository.findBySenderNumber.mockResolvedValue({ id: 'letter-1' });

    await expect(
      service.register(
        {
          sender: 'ООО «Строймонтаж»',
          senderNumber: '144-7',
          receivedAt: '2025-03-01T10:00:00.000Z',
          subject: 'О выделении площадки',
        },
        'user-1',
      ),
    ).rejects.toMatchObject({ code: ErrorCode.CONFLICT });
  });
});
```

## Common Anti-Patterns to Avoid

### ❌ Database Queries in Controllers

```typescript
@Controller('users')
export class UsersController {
  // 🚨 Wrong on two counts: data access in the controller AND
  //    Prisma outside *.repository.ts (repository pattern is mandatory)
  constructor(private prisma: PrismaService) {}

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }
}
```

### ❌ Business Logic in Controllers

```typescript
@Controller('letters')
export class LettersController {
  @Post()
  async register(@Body() data: any) {
    // 🚨 Business rules in controller
    if (!data.responseDueAt) {
      data.responseDueAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }
    // ...
  }
}
```

### ❌ Cross-Module Calls in Controllers (or Services)

```typescript
@Controller('letters')
export class LettersController {
  // 🚨 Importing another module's service couples the modules (I3 violation).
  //    Reach other modules via domain events through the outbox instead.
  constructor(private tasksService: TasksService) {}

  @Post()
  async register(@Body() dto: RegisterLetterDto) {
    const letter = /* ... */;
    await this.tasksService.createResolutionTask(letter.id); // 🚨
    return letter;
  }
}
```

### ❌ Hardcoded Business Enums

```typescript
// 🚨 Business statuses as a TS enum scattered through module code (I15 violation)
enum LetterStage {
  NEW = 'new',
  ANSWERED = 'answered',
}

// ✅ Business lists/statuses live in the `dictionaries` / WorkflowStage
//    tables, referenced by ID; only system constants (error codes, event
//    types, system states) may be enums/const maps in @nodus/contracts.
```

## Summary: Clean Layer Separation

```
┌─────────────────────────────────────────────────────┐
│                   Controller Layer                   │
│  - Parse HTTP requests (Fastify adapter)             │
│  - Validate with zod pipes (@nodus/contracts)        │
│  - Set status codes and headers                      │
│  - Delegate to services                              │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│                    Service Layer                     │
│  - Execute business logic                            │
│  - Enforce business rules                            │
│  - Coordinate repositories + tx (TransactionRunner)  │
│  - Emit domain events via outbox (same transaction)  │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│                  Repository Layer                    │
│  - Data access (the ONLY place Prisma is called)     │
│  - Domain-language methods (findOverdueByAssignee)   │
│  - Cursor pagination, deterministic sort             │
└─────────────────────────────────────────────────────┘
```
