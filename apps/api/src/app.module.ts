import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './core/database/database.module.js';
import { DomainExceptionFilter } from './core/errors/domain-exception.filter.js';
import { FeatureFlagsModule } from './core/feature-flags/feature-flags.module.js';
import { FeatureFlagGuard } from './core/guards/feature-flag.guard.js';
import { PermissionGuard } from './core/guards/permission.guard.js';
import { LoggingModule } from './core/logging/logging.module.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [LoggingModule, DatabaseModule, FeatureFlagsModule, HealthModule],
  providers: [
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    // Порядок: сначала аутентификация/права (401/403), затем фичефлаг (404).
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_GUARD, useClass: FeatureFlagGuard },
  ],
})
export class AppModule {}
