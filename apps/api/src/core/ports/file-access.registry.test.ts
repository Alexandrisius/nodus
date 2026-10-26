import { describe, expect, it, vi } from 'vitest';

import { FileAccessRegistry } from './file-access.registry.js';

const contributor = {
  fileAccessContext: 'chat',
  check: vi.fn(async () => ({ canView: true, canEdit: true })),
};

describe('FileAccessRegistry (#55, F1)', () => {
  it('находит контрибьюторов по маркеру fileAccessContext', () => {
    const discovery = {
      getProviders: () => [
        { instance: contributor },
        { instance: { check: vi.fn() } }, // без маркера — не контрибьютор
        { instance: null },
        { instance: { fileAccessContext: 'letter' } }, // без check
      ],
    };
    const registry = new FileAccessRegistry(discovery as never);
    registry.onModuleInit();
    expect(registry.contributors()).toEqual([contributor]);
  });
});
