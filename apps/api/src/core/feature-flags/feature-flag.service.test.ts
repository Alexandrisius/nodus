import { describe, expect, it, vi } from 'vitest';

import type { FeatureFlagRepository } from './feature-flag.repository.js';
import { FeatureFlagService } from './feature-flag.service.js';

function createService(enabled: boolean | null, enabledKeys: string[] = []) {
  const repository = {
    findEnabled: vi.fn().mockResolvedValue(enabled),
    findEnabledKeys: vi.fn().mockResolvedValue(enabledKeys),
    setEnabled: vi.fn().mockResolvedValue(undefined),
  };
  const service = new FeatureFlagService(repository as unknown as FeatureFlagRepository);
  return { service, repository };
}

describe('FeatureFlagService', () => {
  it('неизвестный флаг считается выключенным (безопасный дефолт)', async () => {
    const { service } = createService(null);
    expect(await service.isEnabled('module-chat')).toBe(false);
  });

  it('читает значение из репозитория', async () => {
    const { service } = createService(true);
    expect(await service.isEnabled('module-chat')).toBe(true);
  });

  it('кэширует значение в пределах TTL', async () => {
    const { service, repository } = createService(true);
    await service.isEnabled('module-chat');
    await service.isEnabled('module-chat');
    expect(repository.findEnabled).toHaveBeenCalledTimes(1);
  });

  it('enabledModules отдаёт список включённых ключей (карточка me, #52)', async () => {
    const { service, repository } = createService(true, ['projects', 'tasks']);
    expect(await service.enabledModules()).toEqual(['projects', 'tasks']);
    expect(repository.findEnabledKeys).toHaveBeenCalledTimes(1);
  });

  it('setEnabled сбрасывает кэш ключа', async () => {
    const { service, repository } = createService(false);
    await service.isEnabled('module-chat');
    repository.findEnabled.mockResolvedValue(true);
    await service.setEnabled('module-chat', true);
    expect(await service.isEnabled('module-chat')).toBe(true);
  });
});
