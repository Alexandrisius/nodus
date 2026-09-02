import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { healthResponseSchema, type HealthResponse } from '@nodus/contracts';

import { Public } from '../core/decorators/public.decorator.js';
import { DatabaseHealthIndicator } from './database-health.indicator.js';
import { RedisHealthIndicator } from './redis-health.indicator.js';

/**
 * Health-checks (канон): `/health/live` — процесс жив; `/health/ready` —
 * БД и Redis доступны (кубернетес/мониторинг). Корневой `/health` — простой
 * liveness для docker-compose healthcheck и Caddy/Cloudflare Tunnel.
 * Явно @Public: оркестратор ходит без аутентификации (и не сломается,
 * если PermissionGuard перейдёт на «закрыто по умолчанию»).
 */
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  @Get()
  getHealth(): HealthResponse {
    // zod-валидация на границе (I7): ответ всегда соответствует контракту.
    return healthResponseSchema.parse({ status: 'ok', timestamp: new Date().toISOString() });
  }

  @Get('live')
  @HealthCheck()
  live() {
    return this.health.check([]);
  }

  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.database.isHealthy('database'),
      () => this.redis.isHealthy('redis'),
    ]);
  }
}
