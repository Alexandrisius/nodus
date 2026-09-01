---
title: Enable CORS with Whitelist Origins Only
impact: CRITICAL
section: 1
impactDescription: Prevents unauthorized domain access
tags: security, cors, production, fastify
---

Wildcard CORS (`*`) allows any malicious site to call the API from a victim's browser. An explicit origin whitelist prevents cross-site abuse. With the Fastify adapter, `app.enableCors()` (Express-style) is replaced by registering `@fastify/cors` on the Fastify instance. **Never use wildcard in production.**

## For AI Agents

### Step 1: Install

```bash
pnpm add @fastify/cors --filter @nodus/api
```

### Step 2: Register with a Whitelist from Configuration

**File:** `apps/api/src/main.ts`

```typescript
// ✅ REQUIRED: explicit whitelist, credentials, platform headers
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import cors from '@fastify/cors';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  await app.register(cors, {
    // ✅ whitelist from env config — never hardcode, never '*'
    origin: config.corsOrigins, // e.g. ['https://nodus.by', 'http://localhost:5173']
    credentials: true, // session cookies / Authorization header cross-origin
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Idempotency-Key', // ✅ required by every mutation (I7) — must pass preflight
    ],
    exposedHeaders: [
      'retry-after', // rate limiting (clients must read backoff)
      'x-ratelimit-limit',
      'x-ratelimit-remaining',
      'x-ratelimit-reset',
    ],
    maxAge: 600, // cache preflight 10 min — fewer OPTIONS round-trips
  });

  await app.listen({ port: config.apiPort, host: '0.0.0.0' });
}
```

Key points:

- **`Idempotency-Key` in `allowedHeaders` is not optional.** Every mutation in the platform sends it (I7); without the header in the preflight list, all cross-origin mutations fail in dev before reaching the API.
- **`credentials: true` + wildcard is impossible by design** — browsers reject `Access-Control-Allow-Origin: *` on credentialed requests. With credentials enabled, an explicit whitelist is the only working configuration, which is exactly what we want.
- **`exposedHeaders`** — the SPA reads `retry-after` / `x-ratelimit-*` to back off correctly when throttled; unlisted response headers are invisible to browser JS.

### Step 3: Origins Come from Environment Config

```typescript
// ✅ File: apps/api/src/config/configuration.ts (excerpt)
// CORS_ORIGINS=https://nodus.by,http://localhost:5173
corsOrigins: (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean),
```

```bash
# ✅ .env.example (template, no real values committed)
CORS_ORIGINS=https://nodus.by,http://localhost:5173
```

Why these two origins:

- **Production is same-origin.** Caddy serves the SPA and proxies `/api/*` on one domain (ADR-0002, `nodus.by`) — same-origin requests send no CORS headers at all. The production whitelist exists for deep tooling and future needs, and stays minimal.
- **Development is cross-origin.** The Vite dev server runs on its own port (`http://localhost:5173`) while the API listens on another — this is the one place CORS actually fires day to day.
- Ports and origins are env-driven (`.env`), never hardcoded — the dev host runs other projects and ports shift (AGENTS.md gotchas).

### Step 4: Reject Loudly, Not Silently

For anything beyond a static list, use the callback form and log denials — a silently dropped origin is a debugging nightmare, an unlogged allowed one is a blind spot:

```typescript
// ✅ Dynamic check with observable denials
origin: (origin, callback) => {
  if (!origin) return callback(null, true); // same-origin / curl / server-to-server
  if (config.corsOrigins.includes(origin)) return callback(null, true);
  logger.warn({ origin }, 'CORS origin rejected');
  return callback(new Error('Origin not allowed'), false);
},
```

Requests **without** an `Origin` header (same-origin browser calls, `curl`, health checks, server-to-server) are not CORS requests — allowing them through is correct, not a hole.

### Step 5: The WebSocket Gateway Needs Its Own CORS

The WS gateway is a separate process (I1) terminating Socket.IO connections from browsers — CORS applies there independently and must be configured with the **same whitelist**:

```typescript
// ✅ apps/ws-gateway: same env-driven whitelist, credentials included
const io = new Server(httpServer, {
  cors: {
    origin: config.corsOrigins,
    credentials: true,
  },
});
```

Registering `@fastify/cors` in the API does nothing for the gateway — check both when a "CORS error" appears only on real-time features.

## Quick Reference Checklist

- [ ] `@fastify/cors` registered on the Fastify instance (not `app.enableCors()` defaults)
- [ ] No `*` origin anywhere; whitelist from `CORS_ORIGINS` env, parsed in config
- [ ] `credentials: true` with explicit origins
- [ ] `Idempotency-Key` in `allowedHeaders`
- [ ] `retry-after` / `x-ratelimit-*` in `exposedHeaders`
- [ ] Preflight cached (`maxAge`)
- [ ] Denied origins logged
- [ ] WS gateway configured with the same whitelist separately
- [ ] `.env.example` documents `CORS_ORIGINS` without real secrets

**Incorrect (vulnerable CORS):**

```typescript
// main.ts 🚨
await app.register(cors); // ❌ default origin '*' — any site can call the API
```

```typescript
// main.ts 🚨
await app.register(cors, {
  origin: '*',
  credentials: true, // ❌ browsers reject this combo; also signals wrong thinking
});
```

**Correct (secure CORS):**

```typescript
// main.ts ✅
await app.register(cors, {
  origin: config.corsOrigins, // ['https://nodus.by', 'http://localhost:5173']
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  exposedHeaders: [
    'retry-after',
    'x-ratelimit-limit',
    'x-ratelimit-remaining',
    'x-ratelimit-reset',
  ],
  maxAge: 600,
});
```
