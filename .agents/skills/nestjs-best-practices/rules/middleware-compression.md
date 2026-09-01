---
title: Enable Compression for API Responses
impact: HIGH
section: 12
impactDescription: Reduces bandwidth usage and improves performance
tags: performance, compression, fastify, gzip, brotli
---

Uncompressed responses waste bandwidth and slow down page loads. Compression (brotli/gzip) reduces JSON response size by 70–90%. With the Fastify adapter, Express-style `app.use(compression())` does not exist — register `@fastify/compress` on the Fastify instance instead. **Always enable compression in production.**

## For AI Agents

### Step 1: Install

```bash
pnpm add @fastify/compress --filter @nodus/api
```

### Step 2: Register Globally in Bootstrap

**File:** `apps/api/src/main.ts`

```typescript
// ✅ REQUIRED: register on the Fastify instance, before listen()
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import compress from '@fastify/compress';
import zlib from 'node:zlib';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  await app.register(compress, {
    global: true, // ✅ compress every eligible route automatically
    threshold: 1024, // don't bother compressing payloads < 1 KB
    encodings: ['br', 'gzip'], // ✅ prefer Brotli, gzip as fallback
    brotliOptions: {
      // quality 4 keeps p95 latency low on a shared host; 11 is for static assets
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 },
    },
  });

  await app.listen({ port: config.apiPort, host: '0.0.0.0' });
}
```

Why these values:

- `threshold: 1024` — compressing a 200-byte response costs more CPU than it saves on the wire, and can even make the payload larger.
- Brotli quality 4 (not the default 11) — quality 11 is designed for pre-compressed static files; at runtime it adds visible latency on large JSON pages. 4–5 is the sweet spot for dynamic API responses.
- `encodings: ['br', 'gzip']` — order encodes server preference; clients without Brotli support get gzip automatically.

### Step 3: Know What Must NOT Be Compressed

Compression buffers the response, which breaks streaming. Disable it per route for server-sent events and other streamed endpoints — in NestJS this is a Fastify route option, set via `SetMetadata` + route config or a custom route decorator at the module that owns streaming:

```typescript
// ❌ WRONG - global compression buffers SSE, events arrive in chunks 🚨
// (nothing to show: it "works" locally and stalls behind proxies)

// ✅ CORRECT - streamed endpoints opt out of compression
fastify.get('/api/v1/exports/stream', { compress: false }, handler);
```

In practice: file downloads proxied from MinIO and any SSE/streaming endpoint get `compress: false`; plain JSON endpoints inherit the global hook.

### Step 4: Pick ONE Compression Layer

The deployment behind Caddy (ADR-0002) means two components can compress:

- **API container** (`@fastify/compress`) — recommended: lives in code, covered by review and tests, identical between dev and prod.
- **Caddy reverse proxy** (`encode` directive) — fine for static frontend assets, which it already serves pre-compressed.

Enable compression for `/api/*` traffic in **one** place only. Double compression wastes CPU and breaks `Content-Length`-dependent clients. Rule of thumb: Caddy compresses the SPA static files, the API compresses its own JSON.

### Step 5: Remember What This Does NOT Cover

- The **WebSocket gateway** is a separate process (I1). Socket.IO negotiates `perMessageDeflate` on its own — `@fastify/compress` in the API has no effect there. Tune it in the gateway's server options if message volume justifies it.
- **Static frontend assets** (Vite build output) are served by Caddy, pre-compressed at build time (`.br`/`.gz`). Do not route them through the API.

## Quick Reference Checklist

- [ ] `@fastify/compress` registered in `main.ts` (not Express `compression()`)
- [ ] Brotli preferred, gzip fallback
- [ ] `threshold` set (~1 KB), no compression of tiny payloads
- [ ] Brotli quality ≤ 5 for dynamic JSON
- [ ] Streaming/SSE/download routes opt out (`compress: false`)
- [ ] Exactly one compression layer for `/api/*` (API **or** Caddy, not both)
- [ ] WS gateway compression handled separately, not assumed from this plugin

**Incorrect (no compression / wrong middleware):**

```typescript
// main.ts - Large uncompressed responses 🚨
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
```

```typescript
// main.ts - Express middleware on a Fastify app 🚨
import compression from 'compression';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  app.use(compression()); // ❌ app.use() does not exist on the Fastify adapter
  await app.listen(3000);
}
```

**Correct (compressed responses):**

```typescript
// main.ts ✅
import compress from '@fastify/compress';
import zlib from 'node:zlib';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  await app.register(compress, {
    global: true,
    threshold: 1024,
    encodings: ['br', 'gzip'],
    brotliOptions: {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 },
    },
  });

  await app.listen({ port: config.apiPort, host: '0.0.0.0' });
}
```
