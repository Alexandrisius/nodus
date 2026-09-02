import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { FEATURE_KEY } from '../decorators/require-feature.decorator.js';
import { DomainException } from '../errors/domain-exception.js';
import { FeatureFlagService } from '../feature-flags/feature-flag.service.js';

/**
 * Отключаемость модулей (I10): маршрут с `@RequireFeature('flag')` при
 * выключенном флаге отвечает NOT_FOUND — выключенный модуль неотличим
 * от несуществующего (не подсказываем клиенту его наличие).
 */
@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const flagKey = this.reflector.getAllAndOverride<string>(FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!flagKey) {
      return true;
    }
    if (!(await this.featureFlags.isEnabled(flagKey))) {
      throw DomainException.notFound('Not found');
    }
    return true;
  }
}
