import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  type SchemaObject,
} from '@nestjs/swagger';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { healthResponseSchema, type HealthResponse } from '@nodus/contracts';

import { Public } from '../core/decorators/public.decorator.js';
import { DatabaseHealthIndicator } from './database-health.indicator.js';
import { RedisHealthIndicator } from './redis-health.indicator.js';

/** Ответ @nestjs/terminus (HealthCheckResult) — своей zod-схемы в contracts нет. */
const terminusHealthSchema: SchemaObject = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['ok', 'error'] },
    info: { type: 'object', additionalProperties: true },
    error: { type: 'object', additionalProperties: true },
    details: { type: 'object', additionalProperties: true },
  },
  required: ['status', 'details'],
};

/**
 * Health-checks (канон): `/health/live` — процесс жив; `/health/ready` —
 * БД и Redis доступны (кубернетес/мониторинг). Корневой `/health` — простой
 * liveness для docker-compose healthcheck и Caddy/Cloudflare Tunnel.
 * Явно @Public: оркестратор ходит без аутентификации (и не сломается,
 * если PermissionGuard перейдёт на «закрыто по умолчанию»).
 */
@Public()
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Простой liveness (docker-compose, Caddy, туннель)' })
  @ApiOkResponse({ standardSchema: healthResponseSchema })
  getHealth(): HealthResponse {
    // zod-валидация на границе (I7): ответ всегда соответствует контракту.
    return healthResponseSchema.parse({ status: 'ok', timestamp: new Date().toISOString() });
  }

  @Get('live')
  @HealthCheck()
  @ApiOperation({ summary: 'Процесс жив (оркестрация)' })
  @ApiOkResponse({ schema: terminusHealthSchema })
  live() {
    return this.health.check([]);
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Готовность: БД и Redis доступны (оркестрация)' })
  @ApiOkResponse({ schema: terminusHealthSchema })
  @ApiServiceUnavailableResponse({
    schema: terminusHealthSchema,
    description: 'Хотя бы одна зависимость недоступна',
  })
  ready() {
    return this.health.check([
      () => this.database.isHealthy('database'),
      () => this.redis.isHealthy('redis'),
    ]);
  }
}
