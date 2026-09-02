import { Global, Module } from '@nestjs/common';

import { AuditRepository } from './audit.repository.js';

/** Аудит (I7): репозиторий глобален, запись — AuditInterceptor (AppModule). */
@Global()
@Module({
  providers: [AuditRepository],
  exports: [AuditRepository],
})
export class AuditModule {}
