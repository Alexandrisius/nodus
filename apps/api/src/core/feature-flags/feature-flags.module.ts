import { Global, Module } from '@nestjs/common';

import { FeatureFlagRepository } from './feature-flag.repository.js';
import { FeatureFlagService } from './feature-flag.service.js';

/** Фичефлаги (I10) — глобальный сервис, guard регистрируется в AppModule. */
@Global()
@Module({
  providers: [FeatureFlagRepository, FeatureFlagService],
  exports: [FeatureFlagService],
})
export class FeatureFlagsModule {}
