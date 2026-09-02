import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { DatabaseHealthIndicator } from './database-health.indicator.js';
import { HealthController } from './health.controller.js';
import { RedisHealthIndicator } from './redis-health.indicator.js';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [DatabaseHealthIndicator, RedisHealthIndicator],
})
export class HealthModule {}
