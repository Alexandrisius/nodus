import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { DatabaseModule } from './core/database/database.module.js';
import { DomainExceptionFilter } from './core/errors/domain-exception.filter.js';
import { LoggingModule } from './core/logging/logging.module.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [LoggingModule, DatabaseModule, HealthModule],
  providers: [{ provide: APP_FILTER, useClass: DomainExceptionFilter }],
})
export class AppModule {}
