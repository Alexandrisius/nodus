import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '@nodus/contracts';

import type { FeatureFlagService } from '../feature-flags/feature-flag.service.js';
import { DomainException } from '../errors/domain-exception.js';
import { FeatureFlagGuard } from './feature-flag.guard.js';

function createGuard(flagKey: string | undefined, enabled: boolean) {
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(flagKey);
  const featureFlags = { isEnabled: vi.fn().mockResolvedValue(enabled) };
  const guard = new FeatureFlagGuard(reflector, featureFlags as unknown as FeatureFlagService);
  return { guard, featureFlags };
}

const CONTEXT = {
  getHandler: () => () => undefined,
  getClass: () => class {},
} as unknown as ExecutionContext;

describe('FeatureFlagGuard', () => {
  it('маршрут без @RequireFeature пропускается', async () => {
    const { guard, featureFlags } = createGuard(undefined, false);
    expect(await guard.canActivate(CONTEXT)).toBe(true);
    expect(featureFlags.isEnabled).not.toHaveBeenCalled();
  });

  it('включённый флаг → пропускается', async () => {
    const { guard } = createGuard('module-chat', true);
    expect(await guard.canActivate(CONTEXT)).toBe(true);
  });

  it('выключенный флаг → NOT_FOUND (модуль неотличим от несуществующего)', async () => {
    const { guard } = createGuard('module-chat', false);
    try {
      await guard.canActivate(CONTEXT);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DomainException);
      expect((error as DomainException).code).toBe(ErrorCode.NOT_FOUND);
    }
  });
});
