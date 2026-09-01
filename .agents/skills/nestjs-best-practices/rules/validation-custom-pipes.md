---
title: Create Custom Pipes for Query Parameter Transformation
impact: MEDIUM
section: 5
impactDescription: Ensures type safety and reduces boilerplate
tags: validation, pipes, transformation, type-safety
---

Query parameters are always strings by default. Custom pipes automatically transform and validate these values before they reach your controller, providing type safety and reducing boilerplate code. **Never manually parse query parameters in controllers.**

> **Hint**: NestJS pipes are executed before controllers. Use them to transform `?limit=50` into `number: 50`, `?active=true` into `boolean: true`, and trim whitespace from strings automatically. Body/DTO validation is a separate concern — it is handled by the `ZodValidationPipe` with schemas from `@nodus/contracts` (see `validation-dto-validation.md`).

## For AI Agents

When implementing or reviewing query parameter handling, **always** follow these steps:

### Step 1: Check for Manual Type Conversion

**Pattern to check:** Look for `parseInt()`, `Number()`, `=== 'true'`, or string operations in controllers.

```typescript
// ❌ WRONG - Manual conversion in controller
@Get('tasks')
async findAll(@Query() query: any) {
  // ❌ Manual parsing - error-prone, NaN possible
  const limit = parseInt(query.limit as string, 10) || 50;

  // ❌ Manual boolean conversion
  const active = query.active === 'true' || query.active === '1';

  // ❌ Manual trimming
  const search = query.search ? (query.search as string).trim() : undefined;

  // ❌ No max bound - client can ask for limit=100000
  if (isNaN(limit)) {
    throw new BadRequestException('Invalid limit');
  }

  return this.tasksService.findAll({ limit, active, search });
}

// ✅ CORRECT - Pipes handle conversion
@Get('tasks')
async findAll(
  @Query('cursor') cursor?: string,
  @Query('limit', new ParseIntPipe({ optional: true, min: 1, max: 100 })) limit?: number,
  @Query('active', new ParseBooleanPipe({ optional: true })) active?: boolean,
  @Query('search', TrimPipe) search?: string,
) {
  return this.tasksService.findAll({ cursor, limit: limit ?? 50, active, search });
}
```

**If found:** Use the pipes from Step 2.

### Step 2: Transformation Pipes Catalog

All pipes live in `apps/api/src/core/pipes/` — one file per pipe, one responsibility per file.

**File:** `apps/api/src/core/pipes/parse-int.pipe.ts`

```typescript
// ✅ REQUIRED: ParseIntPipe with optional/min/max support
import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException } from '@nestjs/common';

@Injectable()
export class ParseIntPipe implements PipeTransform<string, number> {
  constructor(private options?: { optional?: boolean; min?: number; max?: number }) {}

  transform(value: string, metadata: ArgumentMetadata): number {
    // Handle optional empty values
    if (this.options?.optional && (value === undefined || value === null || value === '')) {
      return undefined as unknown as number;
    }

    const parsed = Number.parseInt(value, 10);

    if (Number.isNaN(parsed)) {
      throw new BadRequestException(
        `Validation failed: "${metadata.data}" must be a valid integer`,
      );
    }

    // Range validation
    if (this.options?.min !== undefined && parsed < this.options.min) {
      throw new BadRequestException(
        `Validation failed: "${metadata.data}" must be at least ${this.options.min}`,
      );
    }

    if (this.options?.max !== undefined && parsed > this.options.max) {
      throw new BadRequestException(
        `Validation failed: "${metadata.data}" must be at most ${this.options.max}`,
      );
    }

    return parsed;
  }
}
```

**File:** `apps/api/src/core/pipes/parse-float.pipe.ts`

```typescript
// ✅ REQUIRED: ParseFloatPipe
import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException } from '@nestjs/common';

@Injectable()
export class ParseFloatPipe implements PipeTransform<string, number> {
  constructor(private options?: { optional?: boolean; min?: number; max?: number }) {}

  transform(value: string, metadata: ArgumentMetadata): number {
    if (this.options?.optional && !value) {
      return undefined as unknown as number;
    }

    const parsed = Number.parseFloat(value);

    if (Number.isNaN(parsed)) {
      throw new BadRequestException(
        `Validation failed: "${metadata.data}" must be a valid number`,
      );
    }

    if (this.options?.min !== undefined && parsed < this.options.min) {
      throw new BadRequestException(
        `Validation failed: "${metadata.data}" must be at least ${this.options.min}`,
      );
    }

    if (this.options?.max !== undefined && parsed > this.options.max) {
      throw new BadRequestException(
        `Validation failed: "${metadata.data}" must be at most ${this.options.max}`,
      );
    }

    return parsed;
  }
}
```

**File:** `apps/api/src/core/pipes/parse-boolean.pipe.ts`

```typescript
// ✅ REQUIRED: ParseBooleanPipe
import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException } from '@nestjs/common';

@Injectable()
export class ParseBooleanPipe implements PipeTransform<string, boolean> {
  constructor(private options?: { optional?: boolean }) {}

  transform(value: string, metadata: ArgumentMetadata): boolean {
    if (this.options?.optional && !value) {
      return undefined as unknown as boolean;
    }

    const normalized = value.toLowerCase().trim();

    if (['true', '1', 'yes'].includes(normalized)) {
      return true;
    }

    if (['false', '0', 'no'].includes(normalized)) {
      return false;
    }

    throw new BadRequestException(
      `Validation failed: "${metadata.data}" must be a boolean (true/false, yes/no, 1/0)`,
    );
  }
}
```

**File:** `apps/api/src/core/pipes/trim.pipe.ts`

```typescript
// ✅ REQUIRED: TrimPipe for strings
import { PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';

@Injectable()
export class TrimPipe implements PipeTransform<string, string> {
  transform(value: string, metadata: ArgumentMetadata): string {
    if (typeof value !== 'string') {
      return value;
    }
    return value.trim();
  }
}

// For arrays and objects (deep variant, suitable for global registration)
@Injectable()
export class DeepTrimPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    if (typeof value === 'string') {
      return value.trim();
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.transform(item, metadata));
    }
    if (value && typeof value === 'object') {
      return Object.keys(value).reduce((acc, key) => {
        acc[key] = this.transform(value[key], metadata);
        return acc;
      }, {} as any);
    }
    return value;
  }
}
```

**File:** `apps/api/src/core/pipes/default-value.pipe.ts`

```typescript
// ✅ REQUIRED: DefaultValuePipe
import { PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';

@Injectable()
export class DefaultValuePipe<T = any> implements PipeTransform<T, T> {
  constructor(private readonly defaultValue: T) {}

  transform(value: T, metadata: ArgumentMetadata): T {
    return value === undefined || value === null || value === ''
      ? this.defaultValue
      : value;
  }
}
```

**File:** `apps/api/src/core/pipes/parse-uuid.pipe.ts`

```typescript
// ✅ REQUIRED: ParseUuidPipe — all entity PKs are surrogate UUIDs (data-model)
import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException } from '@nestjs/common';

@Injectable()
export class ParseUuidPipe implements PipeTransform<string, string> {
  constructor(private options?: { optional?: boolean; version?: 4 | 7 }) {}

  transform(value: string, metadata: ArgumentMetadata): string {
    if (this.options?.optional && !value) {
      return undefined as unknown as string;
    }

    const uuidRegex = this.options?.version === 7
      ? /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(value)) {
      throw new BadRequestException(
        `Validation failed: "${metadata.data}" must be a valid UUID${this.options?.version ? ` v${this.options.version}` : ''}`,
      );
    }

    return value;
  }
}
```

### Step 3: Validating Constrained Values — zod, Never Business Enums (I15)

**I15 — no business enums in code.** Task stages, letter types, work types are **not** enums anywhere: they live in `dictionaries` / WorkflowStage tables and are referenced by UUID — a query param filtering by them takes an ID validated with `ParseUuidPipe`. The task **system state** is different: it is a platform-owned constant (`TaskSystemState` in `@nodus/contracts`, see `architecture-enum-classes`) and is filtered through a zod enum pipe. `z.enum` / `z.nativeEnum` schemas in contracts are reserved for **system constants** (sort direction, system states, error codes, event types).

```typescript
// ❌ WRONG - business stage hard-coded as enum (violates I15)
enum TaskStage {
  New = 'new',
  InProgress = 'in_progress',
  Done = 'done',
}

@Get('tasks')
findAll(@Query('stage', new EnumPipe(TaskStage)) stage: TaskStage) { ... }

// ✅ CORRECT - system state via a contracts-enum pipe; business stage by ID
// imports: { z } from 'zod', { TaskSystemState } from '@nodus/contracts'
@Get('tasks')
findAll(
  @Query('status', new ZodEnumPipe(z.nativeEnum(TaskSystemState), { optional: true })) status?: TaskSystemState,
  @Query('stageId', new ParseUuidPipe({ optional: true })) stageId?: string,
) { ... }
```

For system constants, build a generic pipe on top of a zod schema from contracts:

**File:** `apps/api/src/core/pipes/zod-enum.pipe.ts`

```typescript
// ✅ Generic zod-powered pipe for constrained values
import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException } from '@nestjs/common';
import type { ZodType } from 'zod';

@Injectable()
export class ZodEnumPipe<T> implements PipeTransform<string, T> {
  constructor(
    private readonly schema: ZodType<T>,
    private options?: { optional?: boolean },
  ) {}

  transform(value: string, metadata: ArgumentMetadata): T {
    if (this.options?.optional && !value) {
      return undefined as unknown as T;
    }

    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException(
        `Validation failed: "${metadata.data}" has an unsupported value "${value}"`,
      );
    }

    return result.data;
  }
}
```

```typescript
// packages/contracts/src/common/sort.ts — system constant, allowed by I15
import { z } from 'zod';

export const SortDirectionSchema = z.enum(['asc', 'desc']);
export type SortDirection = z.infer<typeof SortDirectionSchema>;

// tasks.controller.ts
import { SortDirectionSchema, type SortDirection } from '@nodus/contracts';

@Get('tasks')
findAll(
  @Query('direction', new ZodEnumPipe(SortDirectionSchema)) direction: SortDirection,
) {
  return this.tasksService.findAll({ direction });
}
```

### Step 4: Use Pipes in Controllers

Lists use cursor pagination per `api-conventions.md`: `?cursor=&limit=` (limit ≤ 100, default 50), deterministic sort, response `{ items, nextCursor }`. The cursor itself is an opaque string — pass it through unparsed.

```typescript
// tasks.controller.ts — clean with pipes ✅
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  findAll(
    @Query('cursor') cursor?: string,
    @Query('limit', new ParseIntPipe({ optional: true, min: 1, max: 100 })) limit?: number,
    @Query('active', new ParseBooleanPipe({ optional: true })) active?: boolean,
    @Query('search', TrimPipe) search?: string,
    @Query('sort', new DefaultValuePipe('-createdAt')) sort?: string,
  ) {
    return this.tasksService.findAll({
      cursor,
      limit: limit ?? 50,   // api-conventions: default 50, max 100
      active,
      search,
      sort,                 // deterministic sort is mandatory
    });
    // → { items, nextCursor }
  }

  @Get(':id')
  findOne(@Param('id', ParseUuidPipe) id: string) {
    return this.tasksService.findOne(id);
  }
}
```

## Pipe Composition and Chaining

Pipes execute left to right — place the parsing pipe first, defaults last:

```typescript
// Apply multiple pipes to a single parameter
@Get('tasks')
async findAll(
  @Query('limit', new DefaultValuePipe('50'), ParseIntPipe) limit: number,
  @Query('minEstimate', ParseFloatPipe, new DefaultValuePipe(0)) minEstimate: number,
) {
  return this.tasksService.findFiltered({ limit, minEstimate });
}
```

## Error Handling in Pipes

The global exception filter (core, see `error-handling-exception-filter.md`) renders every thrown `HttpException` into the standard envelope `{ code, message, details?, traceId }`. Pipes supply the message and, when the client needs field-level feedback, throw the same `DomainException` (`core/errors/domain-exception`) that services use — with `ErrorCode.VALIDATION_FAILED` and structured `details.issues`:

```typescript
// ✅ Field-level validation error in the standard envelope
import { ErrorCode } from '@nodus/contracts';
import { DomainException } from '../errors/domain-exception';

// Use in a pipe — apps/api/src/core/pipes/parse-int.pipe.ts
@Injectable()
export class ParseIntPipe implements PipeTransform<string, number> {
  transform(value: string, metadata: ArgumentMetadata): number {
    const parsed = Number.parseInt(value, 10);

    if (Number.isNaN(parsed)) {
      throw new DomainException(ErrorCode.VALIDATION_FAILED, 'Validation failed', {
        issues: [{ field: metadata.data, message: 'Must be a valid integer', value }],
      });
    }

    return parsed;
  }
}
```

The client receives:

```json
{
  "code": "VALIDATION_FAILED",
  "message": "Validation failed",
  "details": {
    "issues": [{ "field": "limit", "message": "Must be a valid integer", "value": "abc" }]
  },
  "traceId": "3fa85f64-5717-4562-b3fc-2c963f66afa6"
}
```

## Pipe Registration

Pipes constructed inline in decorators (`new ParseIntPipe({ min: 1 })`) need **no** DI registration. Register a pipe in a module only when it is injected by class token, or globally via `APP_PIPE` when it must run on every request:

```typescript
// core/core.module.ts ✅
import { Module } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { DeepTrimPipe } from './pipes/trim.pipe';

@Module({
  providers: [
    // Deep-trims every incoming string before other pipes run
    { provide: APP_PIPE, useClass: DeepTrimPipe },
  ],
})
export class CoreModule {}
```

## Testing Custom Pipes

Pipes are plain classes — test them directly, without `Test.createTestingModule`:

```typescript
// core/pipes/parse-int.pipe.test.ts ✅
import { describe, it, expect, beforeEach } from 'vitest';
import { ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { ParseIntPipe } from './parse-int.pipe';

const meta = { type: 'query', data: 'limit' } as ArgumentMetadata;

describe('ParseIntPipe', () => {
  let pipe: ParseIntPipe;

  beforeEach(() => {
    pipe = new ParseIntPipe();
  });

  it('parses a valid integer string', () => {
    expect(pipe.transform('42', meta)).toBe(42);
  });

  it('throws for a non-numeric string', () => {
    expect(() => pipe.transform('abc', meta)).toThrow(BadRequestException);
  });

  it('returns undefined for an optional empty value', () => {
    const optionalPipe = new ParseIntPipe({ optional: true });
    expect(optionalPipe.transform('', meta)).toBeUndefined();
  });

  it('enforces the min value', () => {
    const pipeWithMin = new ParseIntPipe({ min: 1 });
    expect(() => pipeWithMin.transform('0', meta)).toThrow(BadRequestException);
  });

  it('enforces the max value', () => {
    const pipeWithMax = new ParseIntPipe({ max: 100 });
    expect(() => pipeWithMax.transform('101', meta)).toThrow(BadRequestException);
  });
});
```

## Quick Reference Checklist

Use this checklist when reviewing or creating query parameter handling:

- [ ] No manual `parseInt()` or `Number()` in controllers
- [ ] No manual `=== 'true'` or `trim()` in controllers
- [ ] All numeric query params use `ParseIntPipe` or `ParseFloatPipe`
- [ ] All boolean query params use `ParseBooleanPipe`
- [ ] All string params use `TrimPipe` if whitespace matters
- [ ] Optional params use `optional: true` pipe option
- [ ] `limit` is bounded (`min: 1, max: 100`), default 50 — cursor pagination per api-conventions
- [ ] `:id` path params validated with `ParseUuidPipe` (surrogate UUID PKs)
- [ ] Business stages/types filtered by dictionary or stage ID — never enum pipes (I15)
- [ ] System constants (task system state, sort direction) validated via `ZodEnumPipe` with a schema from `@nodus/contracts`
- [ ] Error messages from pipes are user-friendly; field errors use `DomainException` with `details.issues`

## Best Practices Summary

| Practice | Why |
|----------|-----|
| Use pipes for conversion | Consistent transformation, reusable |
| Make pipes reusable | Add optional/min/max options |
| Attach field-level details | Global filter renders `{ code, message, details, traceId }` |
| Bound `limit` at 100, default 50 | api-conventions cursor pagination |
| Dictionary IDs, not enums | I15: business lists live in `dictionaries` |
| System constants via zod | One schema in `@nodus/contracts`, shared with the frontend |
| Test pipes independently | Direct instantiation — no Nest container needed |
