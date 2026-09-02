import { describe, expect, it, vi } from 'vitest';

import { HealthController } from './health.controller.js';

function createController() {
  const healthCheckService = { check: vi.fn().mockResolvedValue({ status: 'ok' }) };
  const database = { isHealthy: vi.fn() };
  const redis = { isHealthy: vi.fn() };
  const controller = new HealthController(
    healthCheckService as never,
    database as never,
    redis as never,
  );
  return { controller, healthCheckService };
}

describe('HealthController', () => {
  it('GET /health возвращает status ok и валидную метку времени', () => {
    const { controller } = createController();
    const health = controller.getHealth();
    expect(health.status).toBe('ok');
    expect(Number.isNaN(Date.parse(health.timestamp))).toBe(false);
  });

  it('GET /health/ready проверяет БД и Redis через terminus', async () => {
    const { controller, healthCheckService } = createController();
    await controller.ready();
    expect(healthCheckService.check).toHaveBeenCalledWith(
      expect.arrayContaining([expect.any(Function), expect.any(Function)]),
    );
  });
});
