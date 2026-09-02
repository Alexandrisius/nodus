---
title: Use Guards for Route Protection
impact: CRITICAL
section: 7
impactDescription: Enforces authentication/authorization per route
tags: security, guards, auth, authorization, rbac, fastify
---

Unprotected routes expose sensitive data. Guards run before controllers and can short-circuit requests. **Protect endpoints explicitly.** In Nodus, RBAC is enforced at the API-guard level (I8) — never only in the UI.

> **Hint**: Guards determine whether a request will be handled by the controller or not. Use them for authentication (who are you?) and authorization (what can you do?). Always use global guards with public route decorators for default-deny security.

## For AI Agents

When implementing or reviewing security, **always** follow these steps:

### Step 1: Set Up Global Authentication Guard
**Files to create/modify:**
- `src/auth/guards/jwt-auth.guard.ts`
- `src/auth/guards/jwt-auth.guard.test.ts`
- `src/auth/decorators/public.decorator.ts`
- `src/app.module.ts` (for APP_GUARD)

```typescript
// ✅ REQUIRED: Global JWT Guard
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { FastifyRequest } from 'fastify';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      'isPublic',
      [context.getHandler(), context.getClass()],
    );

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const token = this.extractTokenFromHeader(request);

    if (!token) return false;

    try {
      const payload = await this.jwtService.verifyAsync(token);
      // Attach the AuthUser payload — the @GetUser() decorator
      // (see auth-custom-decorators) reads it from here.
      request['user'] = payload;
    } catch {
      return false;
    }

    return true;
  }

  private extractTokenFromHeader(request: FastifyRequest): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
```

### Step 2: Create @Public() Decorator
**File:** `src/auth/decorators/public.decorator.ts`

```typescript
// ✅ REQUIRED: For marking public routes
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

### Step 3: Register Guard Globally
**File:** `src/app.module.ts`

```typescript
// ✅ REQUIRED: Global guard registration
import { APP_GUARD } from '@nestjs/core';

@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,  // ✅ Global authentication
    },
  ],
})
export class AppModule {}
```

### Step 4: Check All Controllers Have Proper Protection
**Pattern to check:**

```typescript
// ❌ WRONG - No protection
@Controller('users')
export class UsersController {
  @Get()
  findAll() { }  // Anyone can access!
}

// ❌ WRONG - Manual check in controller
@Controller('users')
export class UsersController {
  @Get()
  findAll(@Req() req: FastifyRequest) {
    if (!req['user']) throw new UnauthorizedException();  // Too late!
  }
}

// ✅ CORRECT - Protected by global guard
@Controller('users')
export class UsersController {
  @Get()
  findAll() { }  // Protected by JwtAuthGuard
}

// ✅ CORRECT - Explicitly public
@Controller('auth')
export class AuthController {
  @Post('login')
  @Public()  // ✅ Marked as public
  login() { }
}
```

## Quick Reference Checklist

Use this checklist when reviewing or creating endpoints:

- [ ] Global authentication guard registered in `app.module.ts`
- [ ] `@Public()` decorator exists for public routes
- [ ] Controllers don't use `any` type for the request user (use `@GetUser()`)
- [ ] Admin routes have a `@RequirePermissions(...)` guard (Permission enum, not hard-coded role names)
- [ ] Resource owner checks implemented (users can only access their own data)
- [ ] Rate limiting applied to auth endpoints (`@fastify/rate-limit`)
- [ ] Guards use `Reflector` to check metadata
- [ ] RBAC enforced by API guards (I8) — not hidden only in the UI

## Guard Execution Order

```
Request → Middleware → Guards → Interceptors → Pipes → Controller
                              ↑
                         Short-circuit here
```

## Installation

```bash
pnpm add @nestjs/jwt
```

**Incorrect:**

```typescript
// users.controller.ts - All routes exposed 🚨
@Controller('users')
export class UsersController {
  @Get()
  findAll() {
    return this.usersService.findAll();  // 🚨 Publicly accessible!
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);  // 🚨 Anyone can view any user!
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);  // 🚨 Anyone can delete users!
  }
}
```

**Correct:**

```typescript
// auth/guards/jwt-auth.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { FastifyRequest } from 'fastify';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      'isPublic',
      [context.getHandler(), context.getClass()],
    );

    if (isPublic) return true;  // ✅ Skip for public routes

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const token = this.extractTokenFromHeader(request);

    if (!token) return false;

    try {
      const payload = await this.jwtService.verifyAsync(token);
      request['user'] = payload;  // Attach user to request
    } catch {
      return false;
    }

    return true;
  }

  private extractTokenFromHeader(request: FastifyRequest): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}

// auth/decorators/public.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// app.module.ts - Global guard registration
import { APP_GUARD } from '@nestjs/core';

@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,  // ✅ All routes protected by default
    },
  ],
})
export class AppModule {}

// auth/auth.controller.ts - Public routes
@Controller('auth')
export class AuthController {
  @Post('login')
  @Public()  // ✅ Explicitly mark as public
  async login(@Body(new ZodValidationPipe(loginSchema)) dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('register')
  @Public()  // ✅ Explicitly mark as public
  async register(@Body(new ZodValidationPipe(registerSchema)) dto: RegisterDto) {
    return this.authService.register(dto);
  }
}

// users/users.controller.ts - Protected by default
@Controller('users')
export class UsersController {
  @Get()
  findAll() {
    // ✅ Protected by global guard - no @UseGuards needed
    return this.usersService.findAll();
  }

  @Get('profile')
  getProfile(@GetUser() user: AuthUser) {
    // ✅ User attached by the guard, read via the custom decorator
    return user;
  }
}
```

## Role-Based Authorization

Roles are **business data**, not code: they live in the `directory` module, are assigned to users by an administrator, and are resolved to a flat permission set at login — the JWT payload already carries `permissions` (see `auth-custom-decorators`). There is no `ROLES` constant and no `RolesGuard`: hard-coding role names in enums or decorators would mean a deploy for every new role, which the directory exists to avoid.

What used to be "admin only" is expressed as a permission requirement instead:

```typescript
// admin/admin.controller.ts
import { Permission } from '@nodus/contracts';
import { PermissionGuard } from '../core/guards/permission.guard';
import { RequirePermissions } from '../core/guards/require-permissions.decorator';

@Controller('admin')
@UseGuards(PermissionGuard)  // ✅ Apply to controller
export class AdminController {
  @Get()
  @RequirePermissions(Permission.DICTIONARY_MANAGE)  // ✅ Permission, not a hard-coded role
  getDashboard() {
    return this.adminService.getDashboard();
  }

  @Delete('users/:id')
  @RequirePermissions(Permission.USER_MANAGE)  // ✅ Only user managers can delete
  deleteUser(@Param('id') id: string) {
    return this.adminService.deleteUser(id);
  }
}
```

## Resource Owner Guard

```typescript
// tasks/guards/owner.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Permission } from '@nodus/contracts';

@Injectable()
export class OwnerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user, params } = context.switchToHttp().getRequest();

    // Elevated permission (e.g. a руководитель with task.assign) bypasses the owner check
    if (user.permissions?.includes(Permission.TASK_ASSIGN)) return true;

    // Users can only access their own resources
    return user.id === params.userId || user.id === params.id;
  }
}

// tasks/tasks.controller.ts
@Controller('tasks')
export class TasksController {
  @Get('my')
  @UseGuards(OwnerGuard)  // ✅ Resource owner check
  getMyTasks(@GetUser() user: AuthUser) {
    return this.tasksService.findByAssigneeId(user.id);
  }

  @Patch(':id')
  @UseGuards(OwnerGuard)  // ✅ Users can only update their own tasks
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTaskSchema)) dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(id, dto);
  }
}
```

> OwnerGuard is only the coarse first check. The service still verifies ownership against the actual row (`findById` → compare `ownerId`) — route params can lie, the database cannot.

## Permission-Based Authorization

```typescript
// core/guards/require-permissions.decorator.ts
import { SetMetadata } from '@nestjs/common';
import { Permission } from '@nodus/contracts';

export const REQUIRE_PERMISSIONS_KEY = 'requirePermissions';
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRE_PERMISSIONS_KEY, permissions);

// core/guards/permission.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission } from '@nodus/contracts';
import { REQUIRE_PERMISSIONS_KEY } from './require-permissions.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      REQUIRE_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions) return true;

    const { user } = context.switchToHttp().getRequest();
    return requiredPermissions.every((p) => user.permissions?.includes(p));
  }
}

// correspondence/correspondence.controller.ts (входящие/исходящие письма)
@Controller('correspondence')
@UseGuards(PermissionGuard)
export class CorrespondenceController {
  @Post()
  @RequirePermissions(Permission.CORRESPONDENCE_CREATE)  // ✅ Requires specific permission
  create(@Body(new ZodValidationPipe(createLetterSchema)) dto: CreateLetterDto) {
    return this.correspondenceService.create(dto);
  }

  @Delete(':id')
  @RequirePermissions(Permission.CORRESPONDENCE_ARCHIVE)  // ✅ Requires specific permission
  archive(@Param('id') id: string) {
    return this.correspondenceService.archive(id);
  }
}
```

## API Key Guard (Service-to-Service)

Used for machine callers, e.g. the mail-ingestion endpoint that receives incoming letters from our self-hosted mail pipeline:

```typescript
// auth/guards/api-key.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const apiKey = request.headers['x-api-key'];

    // Keys come from the environment, never from code (see config-no-secrets)
    const validApiKeys = this.configService.get<string>('API_KEYS')?.split(',') || [];
    return typeof apiKey === 'string' && validApiKeys.includes(apiKey);
  }
}

// mail-ingest/mail-ingest.controller.ts
@Controller('mail-ingest')
@Public()              // ✅ Skips JWT auth…
@UseGuards(ApiKeyGuard) // ✅ …but requires a valid API key instead
export class MailIngestController {
  @Post('incoming')
  handleIncomingLetter(@Body() payload: IncomingLetterPayload) {
    // письмо → регистрация → резолюция → поручение
    return this.mailIngestService.registerIncoming(payload);
  }
}
```

## Rate Limiting Auth Endpoints

With the Fastify adapter, rate limiting comes from `@fastify/rate-limit` (registered once in `main.ts`) — not from Express middleware. `max` accepts a function of the request, so auth endpoints get stricter limits without per-route plugin wiring:

```typescript
// main.ts
import fastifyRateLimit from '@fastify/rate-limit';

await app.register(fastifyRateLimit, {
  global: true,
  max: async (request) => {
    const url = request.url;
    // ✅ Stricter for login — the primary brute-force target
    if (url.startsWith('/api/v1/auth/login')) return 5;    // 5 per minute
    if (url.startsWith('/api/v1/auth/register')) return 3; // 3 per minute
    if (url.startsWith('/api/v1/auth/')) return 10;
    return 300; // baseline for the rest of the API
  },
  timeWindow: '1 minute',
  keyGenerator: (request) => request.ip, // real client IP needs trustProxy: true
  // ✅ Unified error shape — the same { code, message, traceId } as the rest of the API
  errorResponseBuilder: (request, context) => ({
    code: 'RATE_LIMITED',
    message: `Too many requests, retry after ${context.after}`,
    traceId: String(request.id),
  }),
});
```

> The default store is in-memory per process — sufficient for our single-instance monolith. If the API is ever scaled horizontally, point the plugin at our Redis 8 with the `redis` option (ioredis client) so limits are shared.

## Summary: Guard Best Practices

| Practice | Description |
|----------|-------------|
| Use global guards | Default-deny security with explicit public routes |
| Separate auth from authorization | Different guards for authentication vs authorization |
| Use decorators | Custom decorators improve code readability |
| Keep permission codes in the `Permission` enum of `@nodus/contracts` (roles stay directory data) | Single source of truth, no scattered string literals |
| Check resource ownership | Users can only access their own resources (guard + service re-check) |
| Combine guards | Chain multiple guards for comprehensive security |
| Rate limit auth endpoints | `@fastify/rate-limit` with a `max` function per endpoint class |
| Enforce RBAC in guards, not UI | I8: UI hiding is convenience, guards are the boundary |
