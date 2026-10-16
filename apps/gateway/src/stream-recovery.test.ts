import { describe, expect, it, vi } from 'vitest';
import type { Redis } from 'ioredis';

import {
  pruneOrphanConsumers,
  reclaimIdlePending,
  type StreamRecoveryOptions,
} from './stream-recovery.js';

const OPTIONS: StreamRecoveryOptions = {
  stream: 's',
  group: 'g',
  consumer: 'gateway-7',
  minIdleMs: 60_000,
  orphanIdleMs: 600_000,
  batch: 2,
};

describe('reclaimIdlePending', () => {
  it('проходит PEL курсором до 0-0, обрабатывает записи, пропускает вычищенные (null)', async () => {
    const xautoclaim = vi
      .fn()
      .mockResolvedValueOnce(['5-0', [['1-0', ['envelope', 'a']], null], []])
      .mockResolvedValueOnce(['0-0', [['5-0', ['envelope', 'b']]], ['3-0']]);
    const redis = { xautoclaim } as unknown as Redis;
    const handle = vi.fn(async () => undefined);

    const handled = await reclaimIdlePending(redis, OPTIONS, handle);

    expect(handled).toBe(2);
    expect(handle.mock.calls).toEqual([
      ['1-0', ['envelope', 'a']],
      ['5-0', ['envelope', 'b']],
    ]);
    expect(xautoclaim).toHaveBeenNthCalledWith(1, 's', 'g', 'gateway-7', 60_000, '0-0', 'COUNT', 2);
    expect(xautoclaim).toHaveBeenNthCalledWith(2, 's', 'g', 'gateway-7', 60_000, '5-0', 'COUNT', 2);
  });

  it('пустой PEL — ноль обработанных, один вызов', async () => {
    const xautoclaim = vi.fn().mockResolvedValue(['0-0', [], []]);
    const handle = vi.fn();

    await expect(
      reclaimIdlePending({ xautoclaim } as unknown as Redis, OPTIONS, handle),
    ).resolves.toBe(0);
    expect(xautoclaim).toHaveBeenCalledTimes(1);
    expect(handle).not.toHaveBeenCalled();
  });
});

describe('pruneOrphanConsumers', () => {
  const consumer = (name: string, pending: number, idle: number) => [
    'name',
    name,
    'pending',
    pending,
    'idle',
    idle,
    'inactive',
    idle,
  ];

  it('удаляет только чужих сирот: pending = 0 и idle выше порога', async () => {
    const xinfo = vi.fn().mockResolvedValue([
      consumer('gateway-7', 0, 9_999_999), // себя не трогаем
      consumer('gateway-1', 0, 3_600_000), // сирота → удалить
      consumer('gateway-2', 3, 3_600_000), // есть pending → сначала XAUTOCLAIM
      consumer('gateway-3', 0, 2_000), // живой BLOCK-reader (#108) → не трогаем
    ]);
    const xgroup = vi.fn().mockResolvedValue(0);
    const redis = { xinfo, xgroup } as unknown as Redis;

    const removed = await pruneOrphanConsumers(redis, OPTIONS);

    expect(removed).toEqual(['gateway-1']);
    expect(xinfo).toHaveBeenCalledWith('CONSUMERS', 's', 'g');
    expect(xgroup).toHaveBeenCalledTimes(1);
    expect(xgroup).toHaveBeenCalledWith('DELCONSUMER', 's', 'g', 'gateway-1');
  });

  it('DELCONSUMER выбросил pending (гонка) — громкое предупреждение', async () => {
    const xinfo = vi.fn().mockResolvedValue([consumer('gateway-1', 0, 3_600_000)]);
    const xgroup = vi.fn().mockResolvedValue(2);
    const warn = vi.fn();

    await pruneOrphanConsumers({ xinfo, xgroup } as unknown as Redis, OPTIONS, warn);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('gateway-1'));
  });
});
