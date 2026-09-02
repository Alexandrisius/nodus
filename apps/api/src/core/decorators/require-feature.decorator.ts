import { SetMetadata, type CustomDecorator } from '@nestjs/common';

export const FEATURE_KEY = 'nodus:feature';

/**
 * Маршрут доступен только при включённом фичефлаге (I10):
 * `@RequireFeature('module-chat')`. Проверяет `FeatureFlagGuard`.
 */
export const RequireFeature = (flagKey: string): CustomDecorator<typeof FEATURE_KEY> =>
  SetMetadata(FEATURE_KEY, flagKey);
