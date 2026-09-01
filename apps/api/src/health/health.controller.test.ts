import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('возвращает status ok и валидную метку времени', () => {
    const health = new HealthController().getHealth();

    expect(health.status).toBe('ok');
    expect(Number.isNaN(Date.parse(health.timestamp))).toBe(false);
  });
});
