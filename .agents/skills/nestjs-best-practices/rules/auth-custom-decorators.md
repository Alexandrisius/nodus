---
title: Use Custom Decorators for Type-Safe Request Data Access
impact: HIGH
impactDescription: Improves type safety and reduces boilerplate
section: 7
tags: auth, decorators, types, request, type-safety, fastify
---

Accessing request data directly through `@Req()` or `@Request()` decorators results in verbose, type-unsafe code. Custom decorators encapsulate request data extraction and provide full type safety with autocomplete support. With the Fastify adapter, `@Req()` returns a `FastifyRequest`, which knows nothing about the `user` payload our auth guard attaches — custom decorators close that gap.

The authenticated principal type lives in `packages/contracts` (it is part of the API surface):

```typescript
// packages/contracts/src/auth/auth-user.ts
import type { Permission } from './permissions';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  roleIds: string[]; // directory role IDs — roles are business data, not code
  permissions: Permission[]; // Permission enum (task.create, …), resolved from roles at login
}
```

## For AI Agents

When implementing or reviewing request data access, **always** follow these steps:

### Step 1: Check for Manual Request Data Access
**Pattern to check:** Look for direct access to `req.user`, `req.headers`, type assertions, or manual data extraction.

```typescript
// ❌ WRONG - Manual extraction with type assertion
@Get()
findAll(@Req() req: FastifyRequest) {
  const user = (req as any).user; // ❌ Unsafe type assertion
  return this.tasksService.getTasks(user.id);
}

// ❌ WRONG - Verbose manual extraction
@Post()
create(@Req() req: FastifyRequest, @Body() dto: CreateTaskDto) {
  const user = (req as { user: AuthUser }).user;
  const token = req.headers.authorization?.replace('Bearer ', '');
  return this.tasksService.create(dto, user.id, token);
}

// ❌ WRONG - Repeated extraction logic
@Get('profile')
getProfile(@Req() req: FastifyRequest) {
  const user = (req as { user: AuthUser }).user;
  return { id: user.id, email: user.email, name: user.displayName };
}

@Get('stats')
getStats(@Req() req: FastifyRequest) {
  const user = (req as { user: AuthUser }).user;
  return this.statsService.getUserStats(user.id);
}
```

**If found:** Replace with custom decorators.

### Step 2: Create Custom User Decorator
**File:** `src/auth/decorators/get-user.decorator.ts`

The JWT guard attaches the payload to the request object (see `auth-route-guards`). Type that explicitly instead of casting at every call site:

```typescript
// ✅ REQUIRED: Custom decorator for type-safe user access
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { AuthUser } from '@nodus/contracts';

// The JwtAuthGuard sets request.user after verifying the token.
export type AuthenticatedRequest = FastifyRequest & { user: AuthUser };

export const GetUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);
```

### Step 3: Create Decorator with Property Access
For accessing specific user properties:

```typescript
// ✅ OPTIONAL: Decorator with property selection
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '@nodus/contracts';
import type { AuthenticatedRequest } from './authenticated-request';

export const GetUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    return data ? user?.[data] : user;
  },
);

// Usage:
// @GetUser()              → Returns full AuthUser object
// @GetUser('id')          → Returns user.id
// @GetUser('email')       → Returns user.email
```

### Step 4: Create Decorators for Other Request Data

```typescript
// ✅ OPTIONAL: Headers decorator
// src/common/decorators/headers.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

export const Headers = createParamDecorator(
  (data: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<FastifyRequest>();
    const headers = request.headers;

    return data ? headers[data] : headers;
  },
);

// ✅ OPTIONAL: Bearer token decorator
// src/common/decorators/bearer-token.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

export const BearerToken = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<FastifyRequest>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return null;
    }

    return authHeader.substring(7);
  },
);

// ✅ OPTIONAL: IP address decorator
// src/common/decorators/ip-address.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

export const IpAddress = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<FastifyRequest>();

    // Nodus runs behind Caddy / Cloudflare Tunnel, so the Fastify adapter is
    // created with `trustProxy: true` — then request.ip already resolves
    // X-Forwarded-For correctly and this is all you need:
    return request.ip;
  },
);
```

> If `trustProxy` is not enabled on the adapter, `request.ip` is the direct socket peer (the proxy), not the client. Prefer fixing the adapter option over parsing `x-forwarded-for` by hand; if you must parse manually, take the first entry of the header and `trim()` it.

### Step 5: Use Decorators in Controllers

```typescript
// ✅ REQUIRED: Clean controller with decorators
// tasks/tasks.controller.ts
import { GetUser } from '../auth/decorators/get-user.decorator';
import type { AuthUser } from '@nodus/contracts';

@Controller('tasks')
export class TasksController {
  @Get()
  findAll(@GetUser() user: AuthUser) {
    // ✅ Type-safe, full autocomplete
    return this.tasksService.getTasks(user.id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createTaskSchema)) dto: CreateTaskDto,
    @GetUser() user: AuthUser,
  ) {
    return this.tasksService.create(dto, user.id);
  }

  @Get('profile')
  getProfile(@GetUser() user: AuthUser) {
    // ✅ Type-safe, no assertion needed
    return {
      id: user.id,
      email: user.email,
      name: user.displayName,
    };
  }

  @Get('stats')
  getStats(@GetUser() user: AuthUser) {
    // ✅ Clean and consistent
    return this.statsService.getUserStats(user.id);
  }
}

// ✅ OPTIONAL: Using property selection
@Get('email')
getEmail(@GetUser('email') email: string) {
  return { email };
}

@Get('id')
getId(@GetUser('id') userId: string) {
  return this.service.findById(userId);
}

// ✅ OPTIONAL: Using token decorator
import { BearerToken } from '../common/decorators/bearer-token.decorator';

@Post('refresh')
refreshToken(@BearerToken() token: string) {
  return this.authService.refreshToken(token);
}

// ✅ OPTIONAL: Using IP address decorator (audited actions get the client IP)
import { IpAddress } from '../common/decorators/ip-address.decorator';

@Post('login')
@Public()
login(
  @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
  @IpAddress() ip: string,
) {
  return this.authService.login(dto, ip);
}
```

### Step 6: Create Typed Decorator for the Auth Principal

```typescript
// ✅ OPTIONAL: Fully typed decorator
// src/auth/decorators/get-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { AuthUser } from '@nodus/contracts';

export type AuthenticatedRequest = FastifyRequest & { user: AuthUser };

export const GetUser = createParamDecorator(
  (
    data: keyof AuthUser | undefined,
    ctx: ExecutionContext,
  ): AuthUser | AuthUser[keyof AuthUser] => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    return data ? user?.[data] : user;
  },
);

// Usage with full type safety:
// @GetUser()        → AuthUser
// @GetUser('id')    → string (type of AuthUser.id)
// @GetUser('email') → string (type of AuthUser.email)
```

Custom decorators are a built-in NestJS feature — no packages to install.

**Incorrect:**

```typescript
// tasks/tasks.controller.ts - Verbose and unsafe 🚨
import { Controller, Get, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
  constructor(private tasksService: TasksService) {}

  // ❌ Manual extraction with type assertion
  @Get()
  findAll(@Req() req: FastifyRequest) {
    const user = (req as any).user; // ❌ Type assertion unsafe
    return this.tasksService.getTasks(user.id);
  }

  // ❌ Verbose, repeated extraction logic
  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: FastifyRequest) {
    const user = (req as { user: AuthUser }).user; // ❌ Repeated in every method
    return this.tasksService.findOne(id, user.id);
  }

  // ❌ Type assertion everywhere
  @Post()
  create(@Body() dto: CreateTaskDto, @Req() req: FastifyRequest) {
    const user = (req as { user: AuthUser }).user;
    return this.tasksService.create(dto, user.id);
  }

  // ❌ No autocomplete, no type safety
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
    @Req() req: FastifyRequest,
  ) {
    const user = (req as { user: AuthUser }).user;
    // Does user.id exist? TypeScript doesn't know
    return this.tasksService.update(id, dto, user.id);
  }
}
```

**Correct:**

```typescript
// tasks/tasks.controller.ts - Clean and type-safe ✅
import { Controller, Get, Post, Patch, Param, Body } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { GetUser } from '../auth/decorators/get-user.decorator';
import type { AuthUser } from '@nodus/contracts';

@Controller('tasks')
export class TasksController {
  constructor(private tasksService: TasksService) {}

  // ✅ Type-safe, clean
  @Get()
  findAll(@GetUser() user: AuthUser) {
    // Full autocomplete, type safety
    return this.tasksService.getTasks(user.id);
  }

  // ✅ No repeated extraction
  @Get(':id')
  findOne(@Param('id') id: string, @GetUser() user: AuthUser) {
    return this.tasksService.findOne(id, user.id);
  }

  // ✅ Clean and consistent
  @Post()
  create(
    @Body(new ZodValidationPipe(createTaskSchema)) dto: CreateTaskDto,
    @GetUser() user: AuthUser,
  ) {
    return this.tasksService.create(dto, user.id);
  }

  // ✅ Full autocomplete support
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTaskSchema)) dto: UpdateTaskDto,
    @GetUser() user: AuthUser,
  ) {
    // TypeScript knows user.id exists
    return this.tasksService.update(id, dto, user.id);
  }

  // ✅ Property-specific decorator
  @Get('stats')
  getStats(@GetUser('id') userId: string) {
    return this.statsService.getUserStats(userId);
  }
}

// auth/decorators/get-user.decorator.ts - Basic implementation ✅
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { AuthUser } from '@nodus/contracts';

export const GetUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<FastifyRequest & { user: AuthUser }>();
    return request.user;
  },
);

// auth/decorators/get-user.decorator.ts - With property selection ✅
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const GetUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    return data ? user?.[data] : user;
  },
);

// common/decorators/bearer-token.decorator.ts ✅
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

export const BearerToken = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<FastifyRequest>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return null;
    }

    return authHeader.substring(7);
  },
);

// common/decorators/ip-address.decorator.ts ✅
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

export const IpAddress = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<FastifyRequest>();

    // Requires the Fastify adapter to be created with `trustProxy: true`
    // (Nodus runs behind Caddy / Cloudflare Tunnel).
    return request.ip;
  },
);

// common/decorators/user-agent.decorator.ts ✅
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

export const UserAgent = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<FastifyRequest>();
    return request.headers['user-agent'] || '';
  },
);
```

## Advanced: Decorator Composition

```typescript
// ✅ Combine multiple decorators
// auth/decorators/audit-context.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '@nodus/contracts';
import type { AuthenticatedRequest } from './authenticated-request';

export interface AuditContext {
  user: AuthUser;
  ip: string;
  userAgent: string;
}

// ✅ One decorator that builds the audit context the core audit
//    interceptor would otherwise have to assemble per-handler.
export const GetAuditContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuditContext => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();

    return {
      user: request.user,
      ip: request.ip,
      userAgent: request.headers['user-agent'] || '',
    };
  },
);

// Usage
@Post('approve')
approve(
  @Param('id') id: string,
  @GetAuditContext() audit: AuditContext,
) {
  return this.tasksService.approve(id, audit);
}
```

## Testing Custom Decorators

```typescript
// auth/decorators/get-user.decorator.test.ts ✅
import { describe, it, expect } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { GetUser } from './get-user.decorator';

describe('GetUser Decorator', () => {
  it('should extract user from request', () => {
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: '123', email: 'test@example.com' },
        }),
      }),
    } as unknown as ExecutionContext;

    const result = GetUser(undefined, mockContext);

    expect(result).toEqual({ id: '123', email: 'test@example.com' });
  });

  it('should extract specific property from user', () => {
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: '123', email: 'test@example.com' },
        }),
      }),
    } as unknown as ExecutionContext;

    const result = GetUser('email', mockContext);

    expect(result).toBe('test@example.com');
  });
});
```

## Best Practices Summary

| Practice | Why |
|----------|-----|
| Use `@GetUser()` decorator | Type-safe user access with autocomplete |
| Create decorators for repeated extractions | Eliminates boilerplate code |
| Use property selection for single fields | Cleaner code when only one field needed |
| Create decorators for headers, IP, tokens | Consistent request data access |
| Type decorators with `AuthUser` from `@nodus/contracts` | Full TypeScript support, single source of truth |
| Type the request as `FastifyRequest & { user: AuthUser }` | Matches what the guard actually attaches |
| Rely on `request.ip` with `trustProxy: true` | Correct client IP behind Caddy / Cloudflare Tunnel |
| Test decorators independently | Ensures reliable extraction |
