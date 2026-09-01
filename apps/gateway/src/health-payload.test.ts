import { describe, expect, it } from 'vitest';
import { buildHealthPayload } from './health-payload.ts';

describe('buildHealthPayload', () => {
  it('возвращает status ok и валидную метку времени', () => {
    const payload = buildHealthPayload();

    expect(payload.status).toBe('ok');
    expect(Number.isNaN(Date.parse(payload.timestamp))).toBe(false);
  });
});
