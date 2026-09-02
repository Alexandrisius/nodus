---
title: Implement Rate Limiting for All Routes
impact: CRITICAL
section: 12
impactDescription: Prevents DDoS and brute force attacks
tags: security, performance, ddos, throttling, fastify, redis
---

Unlimited requests per client enable brute-force attacks (password guessing on `/auth/login`) and resource exhaustion. With the Fastify adapter, `@nestjs/throttler`-style Express middleware is replaced by `@fastify/rate-limit`, registered directly on the Fastify instance. **Protect every endpoint from abuse; protect authentication endpoints harder.**

## For AI Agents

### Step 1: Install

```bash
pnpm add @fastify/rate-limit --filter @nodus/api
```

`ioredis` is already a platform dependency (BullMQ, caching, Redis Streams) — reuse the shared client from `infra/redis/`, do not create a second connection pool.

### Step 2: Register Globally with the Redis Store

**File:** `apps/api/src/main.ts`

```typescript
// ✅ REQUIRED: global limiter backed by the shared Redis
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import rateLimit from '@fastify/rate-limit';
import { redis } from './infra/redis/redis.client';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  await app.register(rateLimit, {
    global: true,
    max: 300, // requests per window per client, sane default for a portal UI
    timeWindow: '1 minute',
    redis, // ✅ shared store: counters survive restarts, one source of truth
    nameSpace: 'nodus-rl-', // keeps limiter keys separate from BullMQ/cache keys
    skipOnError: true, // Redis down → fail open (log!) instead of 500s for everyone
    allowList: ['127.0.0.1'], // container health checks must not be throttled
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true, // ✅ clients can back off correctly
    },
    errorResponseBuilder: (request, context) => ({
      // ✅ unified API error format (api-conventions), code from @nodus/contracts
      code: 'RATE_LIMITED',
      message: 'Слишком много запросов. Повторите попытку позже.',
      details: { retryAfter: Math.ceil(context.ttl / 1000) },
      traceId: request.id,
    }),
  });

  await app.listen({ port: config.apiPort, host: '0.0.0.0' });
}
```

Design notes:

- **Redis store, not in-memory.** The default local store resets on every restart and would diverge the moment a second API replica appears. The shared Redis 8 instance is already part of the platform; `nameSpace` keeps its keys isolated from BullMQ and cache keys.
- **`skipOnError: true`** — if Redis is briefly unavailable the API stays up (fail open) instead of rejecting every request. Rate limiting is a shield, not a single point of failure. Pair it with an error log/metric so a silent Redis outage is still visible.
- **Key is the client IP by default.** The limiter's hook runs before NestJS guards, so `request.user` is **not** populated at that point — do not write a `keyGenerator` that reads the authenticated user. Per-user fairness is enforced by the IP key plus, where genuinely needed, application-level checks after auth.
- **`errorResponseBuilder`** must return the platform error shape. A default Fastify 429 body (`{ statusCode, error, message }`) breaks the unified `{ code, message, details?, traceId }` contract the frontend error handling relies on.
- Error `message` is a Russian UI-facing string (i18n terminology rules); `code` comes from the error-code enum in `@nodus/contracts`.

### Step 3: Stricter Limits for Authentication Endpoints

The global default protects the API as a whole; credential endpoints need a much tighter window against brute force. `@fastify/rate-limit` accepts `max` as a function — vary it by route:

```typescript
// ✅ File: apps/api/src/infra/http/rate-limits.ts
import type { FastifyRequest } from 'fastify';

const AUTH_ROUTES = new Set([
  '/api/v1/auth/login',
  '/api/v1/auth/password-reset',
]);

/** Per-route limit policy: strict for auth, default elsewhere. */
export function maxForRoute(request: FastifyRequest): number {
  const url = request.routeOptions?.url ?? '';
  if (AUTH_ROUTES.has(url)) return 5; // ✅ 5 attempts/min against brute force
  return 300;
}
```

```typescript
// main.ts
await app.register(rateLimit, {
  // ...options from Step 2
  max: maxForRoute, // ✅ function form, evaluated per request
});
```

A failed-login lockout (account-level, after N bad attempts) is a separate, application-layer concern — do not try to express it through the HTTP limiter.

### Step 4: What This Does NOT Cover

- The **WebSocket gateway** is a separate process (I1) with its own abuse surface: connection rate, message rate per socket. Those limits live in the gateway configuration, not in this plugin.
- **BullMQ jobs** are unaffected — heavy work must already be offloaded to queues (I7), so an expensive report endpoint being rate-limited is a backstop, not the primary protection.

## Quick Reference Checklist

- [ ] `@fastify/rate-limit` registered on the Fastify instance (not Express middleware, not a per-module guard)
- [ ] Redis store with `nodus-rl-` namespace, shared client from `infra/redis/`
- [ ] Unified error shape from `errorResponseBuilder`, code from `@nodus/contracts`
- [ ] `retry-after` and `x-ratelimit-*` headers enabled
- [ ] `skipOnError: true` with logging/metric on store errors
- [ ] Health checks / loopback allow-listed
- [ ] Auth endpoints limited to ~5 req/min via per-route `max`
- [ ] No `keyGenerator` that depends on `request.user` (auth runs later)
- [ ] WS gateway limits configured separately in the gateway process

**Incorrect (no protection):**

```typescript
// main.ts - Unlimited requests 🚨
async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  await app.listen(3000);
}
```

**Incorrect (wrong stack / broken contract):**

```typescript
// ❌ Express-era guard approach bolted onto Fastify 🚨
await app.register(rateLimit, {
  max: 1000,
  timeWindow: 60,
  // ❌ in-memory store: resets on restart, useless with replicas
  // ❌ default 429 body breaks the unified error contract
  // ❌ no retry-after header — clients retry immediately
  keyGenerator: (req) => req.user.id, // ❌ undefined: guards haven't run yet
});
```

**Correct (rate limited, contract-compliant):**

```typescript
// main.ts ✅
import rateLimit from '@fastify/rate-limit';
import { redis } from './infra/redis/redis.client';
import { maxForRoute } from './infra/http/rate-limits';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  await app.register(rateLimit, {
    global: true,
    max: maxForRoute, // 300/min default, 5/min on auth routes
    timeWindow: '1 minute',
    redis,
    nameSpace: 'nodus-rl-',
    skipOnError: true,
    allowList: ['127.0.0.1'],
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
    errorResponseBuilder: (request, context) => ({
      code: 'RATE_LIMITED',
      message: 'Слишком много запросов. Повторите попытку позже.',
      details: { retryAfter: Math.ceil(context.ttl / 1000) },
      traceId: request.id,
    }),
  });

  await app.listen({ port: config.apiPort, host: '0.0.0.0' });
}
```
