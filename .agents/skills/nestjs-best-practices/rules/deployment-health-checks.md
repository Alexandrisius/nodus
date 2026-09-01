---
title: Implement Health Check Endpoints
impact: HIGH
section: 11
impactDescription: Enables monitoring and automatic restarts
tags: monitoring, health, production, reliability, terminus
---

Without health checks, Docker Compose cannot tell a wedged process from a live one, `depends_on` starts dependent containers against a database that isn't ready, and Grafana/Prometheus (pilot profile) have nothing to scrape. Production apps must expose health status — split into **liveness** (is the process alive?) and **readiness** (can it serve traffic, i.e. are PostgreSQL and Redis reachable?).

Nodus specifics:

- **NestJS runs on the Fastify adapter** — no Express `app.use('/path', router)`; health endpoints are ordinary Nest controllers.
- All containers/ports come from `.env` with the `nodus_` prefix — healthchecks must respect the configured port, never a hardcoded one.
- Health endpoints are **unauthenticated** (orchestrator has no credentials) and therefore must expose only coarse status — no versions, no stack traces, no internals.

```bash
pnpm add @nestjs/terminus
```

## For AI Agents

### Step 1: Add the Health Controller (core)
**File:** `apps/api/src/core/health/health.controller.ts`

```typescript
import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { PrismaService } from '../../infra/prisma.service';
import { RedisHealthIndicator } from './redis.health-indicator';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaHealthIndicator,
    private readonly prismaClient: PrismaService,
    private readonly redis: RedisHealthIndicator,
  ) {}

  /**
   * Liveness: the process is up and the event loop answers.
   * Cheap — used by Docker HEALTHCHECK with a short interval.
   */
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  /**
   * Readiness: all hard dependencies respond.
   * Returns 503 automatically when any indicator is down — Docker and
   * `depends_on: condition: service_healthy` key off this.
   */
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([
      // SELECT 1 against PostgreSQL
      () => this.prisma.pingCheck('database', this.prismaClient),
      // PING against Redis (BullMQ queues, cache, event fanout)
      () => this.redis.isHealthy('redis'),
    ]);
  }
}
```

### Step 2: Write the Redis Indicator
Terminus ships no Redis indicator, so add a custom one via `HealthIndicatorService`. The Redis client is the shared `ioredis` instance from `infra/` (the same one BullMQ uses):

**File:** `apps/api/src/core/health/redis.health-indicator.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../infra/redis.constants';

@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async isHealthy(key: string) {
    const indicator = this.healthIndicatorService.check(key);

    try {
      const pong = await this.redis.ping();
      if (pong !== 'PONG') {
        return indicator.down({ response: pong });
      }
      return indicator.up();
    } catch {
      // Details only say "unreachable" — never leak hosts/ports/credentials
      return indicator.down({ message: 'connection failed' });
    }
  }
}
```

### Step 3: Register the Module
**File:** `apps/api/src/core/health/health.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { InfraModule } from '../../infra/infra.module';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './redis.health-indicator';

@Module({
  imports: [TerminusModule, InfraModule],
  controllers: [HealthController],
  providers: [RedisHealthIndicator],
})
export class HealthModule {}
```

### Step 4: Keep Health Outside the Global API Prefix
The API lives under `/api/v1`, but orchestrator probes conventionally hit `/health/*`. Exclude the controller from the global prefix (Fastify adapter — wildcard paths use the `(.*)` form):

**File:** `apps/api/src/main.ts`

```typescript
import { NestFactory, RequestMethod } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/(.*)', method: RequestMethod.GET },
    ],
  });

  await app.listen(Number(process.env.API_PORT), '0.0.0.0');
}
```

### Step 5: Wire It into Docker

**Dockerfile (`apps/api/Dockerfile`)** — probe with Node's built-in `fetch`; do not assume `curl`/`wget` exist in the runtime image:

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||3000)+'/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
```

**`docker-compose.yml`** — gate the API on healthy dependencies, and dependents on a healthy API:

```yaml
services:
  nodus_postgres:
    image: postgres:17
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U "$${POSTGRES_USER}" -d "$${POSTGRES_DB}"']
      interval: 10s
      timeout: 5s
      retries: 5

  nodus_redis:
    image: redis:7
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 10s
      timeout: 3s
      retries: 5

  nodus_api:
    build: ./apps/api
    env_file: .env
    healthcheck:
      test: ['CMD-SHELL', "node -e \"fetch('http://127.0.0.1:'+(process.env.API_PORT||3000)+'/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
      interval: 30s
      timeout: 5s
      start_period: 20s
      retries: 3
    depends_on:
      nodus_postgres:
        condition: service_healthy
      nodus_redis:
        condition: service_healthy

  nodus_gateway:
    build: ./apps/gateway
    depends_on:
      nodus_api:
        condition: service_healthy
```

## Incorrect vs Correct

**Incorrect (no monitoring):**

```typescript
// 🚨 No health endpoint — Docker can't detect failures, a deadlocked API
// keeps "running" forever, and dependents race a not-yet-ready database.

// 🚨 Also wrong: Express-style wiring that doesn't exist under Fastify
app.use('/api/health', healthRouter);

// 🚨 Also wrong: verbose payload — leaks internals to an unauthenticated route
return {
  status: 'healthy',
  version: '1.4.2',
  node: process.version,
  env: process.env,          // credentials leak!
  uptime: process.uptime(),
};
```

**Correct:**

- `/health/live` — trivial 200, no dependency checks (a slow database must not cascade into container restarts).
- `/health/ready` — Terminus check of PostgreSQL + Redis; 503 with per-service `up`/`down` map when degraded.
- Both routes excluded from the `/api/v1` prefix, unauthenticated, and free of internals.
- Docker `HEALTHCHECK` uses the readiness endpoint and the configured port.

## Quick Reference Checklist

- [ ] Separate liveness (`/health/live`) and readiness (`/health/ready`) endpoints
- [ ] Readiness covers every hard dependency: PostgreSQL (`PrismaHealthIndicator`), Redis (custom indicator)
- [ ] Health routes excluded from the `/api/v1` global prefix
- [ ] Endpoints unauthenticated but expose no versions/stacks/env
- [ ] Dockerfile `HEALTHCHECK` + compose `healthcheck` for `nodus_postgres`, `nodus_redis`, `nodus_api`
- [ ] `depends_on` uses `condition: service_healthy` — no fixed `sleep` hacks
- [ ] Probe honors `API_PORT` from `.env`, never a hardcoded port
- [ ] Health endpoints excluded from request logging/metrics noise (see `error-handling-structured-logging.md`)
