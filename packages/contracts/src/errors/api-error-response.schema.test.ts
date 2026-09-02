import { describe, expect, it } from 'vitest';

import { apiErrorResponseSchema, isSystemErrorCode } from './api-error-response.schema.js';
import { DOMAIN_ERROR_CODE_PATTERN, ErrorCode } from './error-codes.js';

describe('apiErrorResponseSchema', () => {
  it('принимает валидный ответ ошибки', () => {
    const parsed = apiErrorResponseSchema.parse({
      code: ErrorCode.VALIDATION_FAILED,
      message: 'Validation failed',
      details: { issues: [{ path: 'title', message: 'Required' }] },
      traceId: 'req-1',
    });
    expect(parsed.code).toBe('VALIDATION_FAILED');
  });

  it('допускает отсутствие details', () => {
    const parsed = apiErrorResponseSchema.parse({
      code: ErrorCode.NOT_FOUND,
      message: 'Task not found',
      traceId: 'req-2',
    });
    expect(parsed.details).toBeUndefined();
  });

  it('отклоняет ответ без traceId', () => {
    expect(() => apiErrorResponseSchema.parse({ code: 'X', message: 'm' })).toThrow();
  });
});

describe('ErrorCode', () => {
  it('системные коды распознаются isSystemErrorCode', () => {
    expect(isSystemErrorCode(ErrorCode.CONFLICT)).toBe(true);
    expect(isSystemErrorCode('TASK_INVALID_STAGE_TRANSITION')).toBe(false);
  });

  it('доменный код соответствует маске MODULE_REASON', () => {
    expect(DOMAIN_ERROR_CODE_PATTERN.test('TASK_INVALID_STAGE_TRANSITION')).toBe(true);
    expect(DOMAIN_ERROR_CODE_PATTERN.test('task_invalid')).toBe(false);
  });
});
