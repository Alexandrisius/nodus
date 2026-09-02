---
title: Implement Health Check Endpoints
impact: HIGH
section: 11
impactDescription: Enables monitoring and automatic restarts
tags: monitoring, health, production, reliability, terminus
---

Without health checks, Docker Compose cannot tell a wedged process from a live one, `depends_on` starts dependent containers against a database that isn't ready, and monitoring has nothing to scrape. Production apps must expose health status - split into **liveness** (is the process alive?) and **readiness** (can it serve traffic, i.e. are PostgreSQL and Redis reachable?).

Nodus specifics:

- **NestJS runs on the Fastify adapter** - health endpoints are ordinary Nest controllers.
- All containers/ports come from `.env` with the `nodus_` prefix - probes must respect the configured port, never a hardcoded one.
- Health endpoints are **unauthenticated** (orchestrator has no credentials) and therefore expose only coarse status - no versions, no stack traces, no internals.
- Health lives **under the global `/api/v1` prefix**: the demo stand is reached through nginx/Caddy/Cloudflare Tunnel, which proxy only `/api/*` to the API container - root-level `/health` would not be reachable from outside the docker network.

## Implemented (issue #2)

Module `apps/api/src/health/` with `@nestjs/terminus`:

- `GET /api/v1/health` - trivial liveness `{ status: 'ok', timestamp }` (zod contract `HealthResponse` in `@nodus/contracts`); used by the compose healthcheck of `nodus_api` and by the tunnel demo checks.
- `GET /api/v1/health/live` - terminus `health.check([])` (process answers).
- `GET /api/v1/health/ready` - terminus check of **PostgreSQL** (`DatabaseHealthIndicator`: `SELECT 1` via Prisma) and **Redis** (`RedisHealthIndicator`: `PING` via the shared `REDIS_CLIENT` from `core/redis`); 503 with a per-service `up`/`down` map when degraded.

Custom indicators use the current terminus API (`HealthIndicatorService.check(key)` → `indicator.up()` / `indicator.down({ message: 'connection failed' })`); the legacy `HealthIndicator`/`HealthCheckError` classes no longer exist in terminus 12. Indicator failures never leak hosts/ports/credentials - only `connection failed`.

```typescript
// apps/api/src/health/database-health.indicator.ts - the pattern for new indicators
@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly healthIndicator: HealthIndicatorService,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicator.check(key);
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return indicator.up();
    } catch {
      return indicator.down({ message: 'connection failed' });
    }
  }
}
```

## Wiring Rules

- New hard dependency (e.g. MinIO) → its own indicator file in `apps/api/src/health/`, added to the `ready()` check list.
- Request logging skips health paths (`autoLogging.ignore` in `core/logging/logging.module.ts`) - compose probes every 10s would otherwise spam the logs.
- Compose healthchecks: `nodus_postgres` (`pg_isready`), `nodus_redis` (`redis-cli ping`), `nodus_api` (`wget http://127.0.0.1:3001/api/v1/health`); `depends_on` uses `condition: service_healthy` - no fixed `sleep` hacks.
- In alpine containers probe `127.0.0.1`, not `localhost` (localhost resolves to ::1 while the server binds IPv4 - see gotchas).

**Incorrect:** no health endpoint (a deadlocked API keeps "running"); Express-style `app.use()` wiring; verbose payload (`process.env`, versions, uptime) on an unauthenticated route.

## Quick Reference Checklist

- [ ] Liveness (`/api/v1/health`, `/api/v1/health/live`) and readiness (`/api/v1/health/ready`) endpoints
- [ ] Readiness covers every hard dependency (PostgreSQL, Redis; extend with MinIO etc.)
- [ ] Endpoints unauthenticated but expose no versions/stacks/env
- [ ] Indicators via `HealthIndicatorService` (terminus 12 API), failures say only `connection failed`
- [ ] Compose `healthcheck` for postgres/redis/api; `depends_on: condition: service_healthy`
- [ ] Probe honors the configured port, never hardcoded; `127.0.0.1` in alpine
- [ ] Health paths excluded from request-log noise
