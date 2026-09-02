import type { ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { ErrorCode } from '@nodus/contracts';

import { DomainException } from './domain-exception.js';
import { DomainExceptionFilter } from './domain-exception.filter.js';

function createHost(traceId = 'req-1') {
  const send = vi.fn();
  const status = vi.fn().mockReturnValue({ send });
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ id: traceId }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, send };
}

function createFilter() {
  const logger = { setContext: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const filter = new DomainExceptionFilter(logger as never);
  return { filter, logger };
}

describe('DomainExceptionFilter', () => {
  it('DomainException → единый формат с кодом, details и traceId', () => {
    const { filter } = createFilter();
    const { host, status, send } = createHost('trace-42');

    filter.catch(new DomainException(ErrorCode.NOT_FOUND, 'Task not found', { id: '1' }), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(send).toHaveBeenCalledWith({
      code: 'NOT_FOUND',
      message: 'Task not found',
      details: { id: '1' },
      traceId: 'trace-42',
    });
  });

  it('доменный код MODULE_REASON по умолчанию → 400', () => {
    const { filter } = createFilter();
    const { host, status, send } = createHost();

    filter.catch(new DomainException('TASK_INVALID_STAGE_TRANSITION', 'Bad stage'), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'TASK_INVALID_STAGE_TRANSITION' }),
    );
  });

  it('непредвиденная ошибка → 500 INTERNAL_ERROR без деталей наружу', () => {
    const { filter, logger } = createFilter();
    const { host, status, send } = createHost();

    filter.catch(new Error('db connection string leaked here'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(send).toHaveBeenCalledWith({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      traceId: 'req-1',
    });
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it('голый ZodError с границы → 400 VALIDATION_FAILED с details.issues', () => {
    const { filter } = createFilter();
    const { host, status, send } = createHost();

    filter.catch(
      new ZodError([
        {
          code: 'too_small',
          minimum: 1,
          origin: 'string',
          path: ['title'],
          message: 'Required',
          input: '',
        } as never,
      ]),
      host,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'VALIDATION_FAILED',
        details: { issues: [{ path: 'title', code: 'too_small', message: 'Required' }] },
      }),
    );
  });
});
