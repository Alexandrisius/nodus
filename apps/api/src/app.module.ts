import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuditModule } from './core/audit/audit.module.js';
import { CryptoModule } from './core/crypto/crypto.module.js';
import { DatabaseModule } from './core/database/database.module.js';
import { DomainExceptionFilter } from './core/errors/domain-exception.filter.js';
import { EventsModule } from './core/events/events.module.js';
import { FeatureFlagsModule } from './core/feature-flags/feature-flags.module.js';
import { FeatureFlagGuard } from './core/guards/feature-flag.guard.js';
import { PermissionGuard } from './core/guards/permission.guard.js';
import { AuditInterceptor } from './core/interceptors/audit.interceptor.js';
import { IdempotencyInterceptor } from './core/interceptors/idempotency.interceptor.js';
import { LoggingModule } from './core/logging/logging.module.js';
import { RedisModule } from './core/redis/redis.module.js';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard.js';
import { DirectoryModule } from './modules/directory/directory.module.js';

@Module({
  imports: [
    LoggingModule,
    DatabaseModule,
    RedisModule,
    CryptoModule,
    EventsModule,
    FeatureFlagsModule,
    AuditModule,
    HealthModule,
    AuthModule,
    DirectoryModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    // Порядок guard-ов: аутентификация (401) → права (403) → фичефлаг (404).
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_GUARD, useClass: FeatureFlagGuard },
    // Порядок интерсепторов: идемпотентность внешний (replay не плодит аудит),
    // аудит внутренний (пишет только реально исполненные действия).
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
