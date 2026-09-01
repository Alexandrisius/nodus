import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './health-response.schema.js';

describe('healthResponseSchema', () => {
  it('принимает валидный ответ healthcheck', () => {
    const parsed = healthResponseSchema.parse({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
    expect(parsed.status).toBe('ok');
  });

  it('отклоняет невалидный timestamp', () => {
    expect(() => healthResponseSchema.parse({ status: 'ok', timestamp: 'не дата' })).toThrowError();
  });
});
