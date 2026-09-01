---
title: Use @fastify/helmet for Security Headers
impact: CRITICAL
impactDescription: Protects against XSS, clickjacking, and other web attacks
section: 1
tags: security, fastify, helmet, production
---

## Use @fastify/helmet for Security Headers

The API exposes HTTP responses that attackers can exploit when security headers are missing. `@fastify/helmet` automatically sets headers like `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, and `Content-Security-Policy`. **Always enable it in production.**

> **Hint**: Register helmet **before** `app.listen()`. The plugin hooks into Fastify's `onRequest` phase, so headers are applied to every response — including 401/404/500 error responses and the routes NestJS registers at listen time. Register helmet **first** among Fastify plugins: a plugin registered earlier that terminates the request itself (e.g. `@fastify/rate-limit` sending a 429) can bypass hooks registered after it.

### Installation

```bash
pnpm add @fastify/helmet
```

### Usage

**Incorrect:**

```typescript
// main.ts 🚨
import helmet from 'helmet';  // ❌ Express package — does not work with FastifyAdapter

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  // ❌ app.use() is Express-style middleware — Fastify plugins use register()
  app.use(helmet());

  await app.listen(3000);
}
```

**Correct:**

```typescript
// main.ts ✅
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  // Fastify plugins are registered with register(), not use().
  // Helmet applies to all routes globally by default (global: true).
  await app.register(helmet);

  app.setGlobalPrefix('api/v1');
  await app.listen(3000);
}
bootstrap();
```

### Content Security Policy and Swagger UI

OpenAPI docs are served at `/api/docs` (authorized users only, per `api-conventions.md`). Swagger UI loads inline scripts and styles, so helmet's default CSP blocks it. Configure directives explicitly instead of dropping the header site-wide:

```typescript
// main.ts ✅ — CSP that keeps Swagger UI working
await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: [`'self'`],
      scriptSrc: [`'self'`, `'unsafe-inline'`],   // Swagger UI inline bootstrap
      styleSrc: [`'self'`, `'unsafe-inline'`],    // Swagger UI inline styles
      imgSrc: [`'self'`, 'data:'],                // Swagger UI favicon/logo
      workerSrc: [`'self'`, 'blob:'],
      objectSrc: [`'none'`],
      frameAncestors: [`'none'`],                 // clickjacking protection
    },
  },
});
```

If CSP still breaks a first-party tool, disable only CSP — never the rest of helmet:

```typescript
await app.register(helmet, {
  contentSecurityPolicy: false,  // acceptable for internal tools behind auth; document why
});
```

> **Note:** The SPA (`apps/web`) is served by Caddy as static files — its CSP and caching headers belong to the Caddy layer. Helmet here protects the JSON API and `/api/docs`.

### Quick Reference Checklist

- [ ] `@fastify/helmet` (not the Express `helmet` package) registered in `main.ts`
- [ ] Registered before `app.listen()`, first among Fastify plugins
- [ ] CSP configured so Swagger UI at `/api/docs` works
- [ ] No `app.use()` Express-style middleware in bootstrap
