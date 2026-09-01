---
title: Validate All Inputs with DTOs and Zod Validation Pipe
impact: CRITICAL
impactDescription: Prevents invalid data and injection attacks
section: 5
tags: validation, security, dto, zod, contracts
---

## Validate All Inputs with DTOs and Zod Validation Pipe

Unvalidated inputs lead to runtime errors, injection, and security vulnerabilities. Every request body is validated against a **zod schema from `@nodus/contracts`** before it reaches the controller (I7). One schema serves both the API boundary and frontend forms. **Never trust client data.**

**Incorrect:**

```typescript
// users.controller.ts 🚨
@Post()
create(@Body() createUserDto: any) {
  // Any data can be passed - vulnerable!
  return this.usersService.create(createUserDto);
}

// dto/create-user.dto.ts 🚨 - plain class, no validation
export class CreateUserDto {
  email: string;
  password: string;
  age: number;
}
```

**Correct:**

1. The schema lives in contracts — shared with the frontend:

```typescript
// packages/contracts/src/users/create-user.schema.ts ✅
import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email({ message: 'Invalid email format' }),
  password: z
    .string()
    .min(12, { message: 'Password must be at least 12 characters' })
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
      message: 'Password must contain uppercase, lowercase, and number',
    }),
  name: z.string().min(2).optional(),
  age: z.number().int().min(18).max(120).optional(),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;
```

2. One reusable validation pipe in core:

```typescript
// apps/api/src/core/pipes/zod-validation.pipe.ts ✅
import { PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';
import { ZodSchema } from 'zod';
import { ErrorCode } from '@nodus/contracts';
import { DomainException } from '../errors/domain-exception';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata) {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      // ✅ Same domain exception as services throw; the global filter maps it to the envelope
      throw new DomainException(ErrorCode.VALIDATION_FAILED, 'Validation failed', {
        issues: result.error.issues,
      });
    }

    return result.data;  // parsed & typed output — unknown keys stripped
  }
}
```

3. Applied at the boundary of every endpoint:

```typescript
// users.controller.ts ✅
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { createUserSchema, type CreateUserDto } from '@nodus/contracts';

@Post()
create(@Body(new ZodValidationPipe(createUserSchema)) createUserDto: CreateUserDto) {
  // Body is validated and fully typed before reaching here
  return this.usersService.create(createUserDto);
}
```

> The schema is passed explicitly per endpoint: unlike class-validator's global `ValidationPipe`, the zod pipe needs the schema at the call site. This keeps validation explicit and co-located with the route. Use `@UsePipes(new ZodValidationPipe(Schema))` at controller level when one schema covers all routes. Module DTO files re-export schemas from contracts (`dto/` contains no duplicated definitions).

## Zod Equivalents of ValidationPipe Options

| class-validator era option | zod / Nodus equivalent |
|---|---|
| `whitelist: true` (strip unknown keys) | default `z.object()` behavior — unknown keys are stripped |
| `forbidNonWhitelisted: true` | `.strict()` on the object schema — unknown keys become an error |
| `transform: true` (plain object → typed instance) | the pipe returns `result.data`, typed as `z.infer<typeof Schema>` |
| `transformOptions.enableImplicitConversion` | `z.coerce.number()`, `z.coerce.boolean()`, `z.coerce.date()` for query strings |
| detailed error messages | `ZodError.issues` mapped into `details.issues` of the error envelope |

## Common Validators Cheat Sheet

| Rule | class-validator | zod |
|---|---|---|
| Email | `@IsEmail()` | `z.string().email()` |
| UUID | `@IsUUID()` | `z.string().uuid()` |
| Length | `@MinLength(8)` / `@MaxLength(50)` | `.min(8)` / `.max(50)` |
| Regex | `@Matches(/.../)` | `.regex(/.../)` |
| Integer | `@IsInt()` | `z.number().int()` |
| Range | `@Min(18)` / `@Max(120)` | `.min(18)` / `.max(120)` |
| Optional | `@IsOptional()` | `.optional()` |
| Enum — system constants only (I15) | `@IsEnum(X)` | `z.enum([...])` defined in contracts |
| One of set | `@IsIn([...])` | `z.enum([...])` / `z.union([z.literal('a'), z.literal('b')])` |
| Array size | `@ArrayMinSize(1)` | `z.array(Item).min(1)` |
| Nested object | `@ValidateNested() @Type(() => X)` | nested schema — no decorators needed |
| UTC date-time | `@IsDateString()` | `z.string().datetime()` — all dates UTC ISO 8601 |

> Business lists (task stage, priority, letter type, work type) are **never** `z.enum` — they are `dictionaries` / `WorkflowStage` entries referenced by UUID (I15). Validate them as `z.string().uuid()` and let the service check existence against the database. System constants (task system state, sort direction) are validated against contracts enums — see `architecture-enum-classes`.
>
> For query parameter transformation (single params, coercion) see `validation-custom-pipes.md`; for filter DTOs on list endpoints see `validation-filter-dtos.md`.

## Custom Validators (Reusable Refinements)

Business-specific rules are shared refinement functions in contracts, applied with `.superRefine()`:

```typescript
// packages/contracts/src/users/password-strength.ts ✅
import type { RefinementCtx } from 'zod';

// At least 12 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
const STRONG_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/;

export function strongPassword(value: string, ctx: RefinementCtx) {
  if (!STRONG_PASSWORD.test(value)) {
    ctx.addIssue({
      code: 'custom',
      message:
        'Password must contain at least 12 characters, including uppercase, lowercase, number, and special character',
    });
  }
}
```

```typescript
// packages/contracts/src/users/create-user.schema.ts
export const createUserSchema = z.object({
  // ...
  password: z.string().superRefine(strongPassword),
});
```

> Frontend forms reuse the same schema via `react-hook-form` + `zodResolver` — one source of truth, no duplicated rules (patterns.md).

## Nested DTOs

```typescript
// packages/contracts/src/correspondence/register-letter.schema.ts ✅
import { z } from 'zod';

export const letterAttachmentSchema = z.object({
  fileId: z.string().uuid(),
  sortOrder: z.number().int().min(0),
});

export const registerLetterSchema = z.object({
  sender: counterpartySchema,                          // nested object — validated recursively
  attachments: z.array(letterAttachmentSchema).min(1), // non-empty array of nested items
});

export type RegisterLetterDto = z.infer<typeof registerLetterSchema>;
```

## Expected Validation Error Response

The global exception filter (core, see `error-handling-exception-filter.md`) wraps the pipe's `DomainException` into the standard envelope (`issues` are raw zod issues):

```json
{
  "code": "VALIDATION_FAILED",
  "message": "Validation failed",
  "details": {
    "issues": [
      { "code": "invalid_string", "path": ["email"], "message": "Invalid email format" },
      { "code": "invalid_string", "path": ["password"], "message": "Password must contain uppercase, lowercase, and number" },
      { "code": "too_small", "path": ["age"], "message": "Number must be greater than or equal to 18" }
    ]
  },
  "traceId": "3fa85f64-5717-4562-b3fc-2c963f66afa6"
}
```

## Quick Reference Checklist

- [ ] Every DTO is a zod schema in `packages/contracts` — no DTOs duplicated in apps
- [ ] Every endpoint validates the body via `ZodValidationPipe` and query/params via transformation pipes
- [ ] No `any` on `@Body()` / `@Query()` parameters
- [ ] Unknown keys stripped (default) or rejected (`.strict()`) — a conscious choice per schema
- [ ] Business lists/statuses validated as dictionary IDs — never `z.enum` (I15)
- [ ] Reusable rules extracted as refinements in contracts, shared with frontend forms
- [ ] Schema change = zod schemas + OpenAPI annotations updated in the same commit (api-conventions)
