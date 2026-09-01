---
name: nestjs-best-practices
description: NestJS 11 + Fastify best practices for the Nodus backend. Use when writing, reviewing, or refactoring NestJS code — modules, controllers, services, repositories (Prisma), guards, pipes (zod), event bus (outbox), auth (argon2id), error handling, logging (pino), caching (Redis), or testing (Vitest).
license: MIT
metadata:
  author: nodus (based on xirothedev rules)
  version: "1.0.0"
---

# NestJS Best Practices (Nodus)

Guide for building production-ready NestJS modules in our stack: **NestJS 11 + Fastify, Prisma + PostgreSQL, Redis + BullMQ, zod contracts, EventBus + outbox, Vitest**. 32 rules across 13 categories, prioritized by impact.

Apply when:

- Writing new NestJS modules, controllers, services, or repositories
- Implementing authentication and authorization (guards, decorators)
- Setting up Prisma database operations (repository pattern, transactions, outbox)
- Creating DTOs and validation (zod schemas from `@nodus/contracts`)
- Implementing error handling and logging
- Reviewing or refactoring backend code

Authoritative project docs (win over any generic advice): `docs/architecture/patterns.md`, `docs/architecture/api-conventions.md`, `docs/architecture/invariants.md`.

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Security | CRITICAL | `security-` |
| 2 | Performance | HIGH | `performance-` |
| 3 | Architecture | HIGH | `architecture-` |
| 4 | Error Handling | HIGH | `error-handling-` |
| 5 | Validation | CRITICAL | `validation-` |
| 6 | Database | CRITICAL | `database-` |
| 7 | Authentication | CRITICAL | `auth-` |
| 8 | API | MEDIUM | `api-` |
| 9 | Configuration | CRITICAL | `config-` |
| 10 | Testing | MEDIUM | `testing-` |
| 11 | Deployment | MEDIUM | `deployment-` |
| 12 | Middleware | MEDIUM | `middleware-` |
| 13 | Advanced | HIGH | `advanced-` |

## Quick Reference

### 1. Security (CRITICAL)

- `security-cors-whitelist` - `@fastify/cors` with whitelist origins, `Idempotency-Key` in allowed headers
- `security-dependency-audit` - `pnpm audit` in CI + Dependabot
- `security-helmet-headers` - `@fastify/helmet` security headers (register before listen)

### 2. Performance (HIGH)

- `performance-redis-caching` - Cache-aside with Redis; invalidation via domain events; key convention `nodus:<module>:`

### 3. Architecture (HIGH)

- `architecture-short-functions` - Keep functions short and single purpose
- `architecture-feature-modules` - Module structure per patterns.md; strict isolation, events over imports
- `architecture-no-dead-code` - Remove unused code and dependencies (pnpm tooling)
- `architecture-thin-controllers` - Controller = HTTP only; zod pipe → service → DTO
- `architecture-naming-conventions` - Consistent naming conventions
- `architecture-event-driven` - Cross-module communication via core EventBus + transactional outbox (I9)
- `architecture-enum-classes` - Business lists in `dictionaries`/WorkflowStage; enums only for system constants in contracts (I15)

### 4. Error Handling (HIGH)

- `error-handling-exception-filter` - Global filter: domain errors → `{ code, message, details?, traceId }`
- `error-handling-structured-logging` - pino + nestjs-pino; redact secrets; traceId correlation
- `error-handling-logger-context` - Fastify request id as traceId; log and rethrow, never swallow

### 5. Validation (CRITICAL)

- `validation-custom-pipes` - Transformation pipes (trim, parse UUID, cursor pagination) over zod schemas
- `validation-dto-validation` - All inputs via zod schemas from `@nodus/contracts` + ZodValidationPipe
- `validation-filter-dtos` - Filter DTOs as zod schemas; cursor pagination `{ items, nextCursor }`

### 6. Database (CRITICAL)

- `database-parameterized-queries` - Parameterized queries only; raw SQL confined to repositories
- `database-repository-pattern` - Prisma only in `*.repository.ts`; domain-language methods; tx + outbox

### 7. Authentication (CRITICAL)

- `auth-password-hashing` - Argon2id via `argon2` package; parameters, rehash-on-login, bcrypt migration
- `auth-route-guards` - Guards for route protection (I8); `@Public()` for webhooks
- `auth-custom-decorators` - `@GetUser()` / audit-context decorators over FastifyRequest

### 8. API (MEDIUM)

- `api-cursor-pagination` - `?cursor=&limit=` (≤100, default 50), response `{ items, nextCursor }`
- `api-swagger-docs` - OpenAPI generated from decorators, published at `/api/docs` for authorized users
- `interceptors-response-transform` - Responses serialized via contract zod schemas; no envelopes, no raw Prisma rows

### 9. Configuration (CRITICAL)

- `config-no-secrets` - Never hardcode secrets; env validation via zod at startup

### 10. Testing (MEDIUM)

- `testing-unit-tests` - Vitest; services tested with mocked repository; tests next to code

### 11. Deployment (MEDIUM)

- `deployment-health-checks` - `/health/live` and `/health/ready` via @nestjs/terminus; Docker/compose healthchecks

### 12. Middleware (MEDIUM)

- `middleware-compression` - `@fastify/compress`; single compression layer; SSE opt-out
- `middleware-rate-limiting` - `@fastify/rate-limit` with Redis store; unified error format

### 13. Advanced (HIGH)

- `advanced-lazy-loading` - Lazy load non-critical modules
- `advanced-scheduled-tasks` - BullMQ job schedulers (no `@nestjs/schedule`): cron patterns, overlap control, monitoring

## How to Use

Read individual rule files for detailed explanations and code examples:

```
rules/architecture-event-driven.md
rules/database-repository-pattern.md
```

Each rule file contains:

- Step-by-step guidance with explicit file locations
- ❌ WRONG vs ✅ CORRECT patterns
- Quick reference checklist for review
