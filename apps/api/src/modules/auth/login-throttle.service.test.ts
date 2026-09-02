import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoginThrottleService } from './login-throttle.service.js';

describe('LoginThrottleService', () => {
  const redis = {
    get: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
    del: vi.fn(),
  };

  let service: LoginThrottleService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new LoginThrottleService(redis as never);
  });

  it('блокирует после 10 неудач за окно', async () => {
    redis.get.mockResolvedValue('9');
    expect(await service.isLocked('a@b.by')).toBe(false);
    redis.get.mockResolvedValue('10');
    expect(await service.isLocked('a@b.by')).toBe(true);
  });

  it('первая неудача ставит окно 10 минут; ключ — по email в нижнем регистре', async () => {
    redis.incr.mockResolvedValueOnce(1).mockResolvedValueOnce(2);

    await service.recordFailure('Admin@Nodus.by');
    expect(redis.incr).toHaveBeenCalledWith('nodus:auth:login_fail:admin@nodus.by');
    expect(redis.expire).toHaveBeenCalledWith('nodus:auth:login_fail:admin@nodus.by', 600);

    await service.recordFailure('Admin@Nodus.by');
    expect(redis.expire).toHaveBeenCalledTimes(1); // повторно окно не продлеваем
  });

  it('reset удаляет счётчик', async () => {
    await service.reset('a@b.by');
    expect(redis.del).toHaveBeenCalledWith('nodus:auth:login_fail:a@b.by');
  });
});
