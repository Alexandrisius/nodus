import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '@nodus/contracts';

import { createDocsAuthMiddleware } from './docs-auth.middleware.js';

/**
 * Посредник получает СЫРЫЕ объекты Node (см. комментарий в файле посредника),
 * поэтому в тестах — минимум-заглушки в стиле `http.IncomingMessage`/`ServerResponse`.
 */
function harness(url: string, authorization?: string) {
  const request = {
    url,
    id: 'trace-1',
    headers: authorization ? { authorization } : {},
  } as unknown as IncomingMessage & { id: string };
  const reply = {
    statusCode: 200,
    setHeader: vi.fn(),
    end: vi.fn(),
  } as unknown as ServerResponse;
  const next = vi.fn();
  return { request, reply, next };
}

async function run(url: string, authorization: string | undefined, verifyResult: 'ok' | 'fail') {
  const verifyAccessToken = vi.fn().mockResolvedValue({ sub: 'user-1' });
  if (verifyResult === 'fail') verifyAccessToken.mockRejectedValue(new Error('expired'));
  const middleware = createDocsAuthMiddleware(verifyAccessToken);
  const { request, reply, next } = harness(url, authorization);
  await middleware(request, reply, next);
  return { verifyAccessToken, reply, next };
}

function sentBody(reply: ServerResponse): { code: string; message: string; traceId: string } {
  const call = (reply.end as ReturnType<typeof vi.fn>).mock.calls.at(-1);
  if (!call) throw new Error('reply.end не вызывался');
  return JSON.parse(call[0] as string);
}

describe('createDocsAuthMiddleware', () => {
  it('маршруты вне /api/docs пропускает без проверки токена', async () => {
    const { verifyAccessToken, next } = await run('/api/v1/auth/login', undefined, 'ok');
    expect(verifyAccessToken).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  it('без токена — 401 единого формата, дальше запрос не идёт', async () => {
    const { reply, next } = await run('/api/docs', undefined, 'ok');
    expect(reply.statusCode).toBe(401);
    expect(sentBody(reply)).toEqual({
      code: ErrorCode.UNAUTHENTICATED,
      message: 'Authentication required',
      traceId: 'trace-1',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('не-Bearer-схема — 401', async () => {
    const { reply, next } = await run('/api/docs', 'Basic dXNlcjpwYXNz', 'ok');
    expect(reply.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('валидный токен — запрос проходит', async () => {
    const { verifyAccessToken, next } = await run('/api/docs', 'Bearer good-token', 'ok');
    expect(verifyAccessToken).toHaveBeenCalledWith('good-token');
    expect(next).toHaveBeenCalledWith();
  });

  it('невалидный/просроченный токен — 401', async () => {
    const { reply, next } = await run('/api/docs', 'Bearer bad-token', 'fail');
    expect(reply.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('закрыты и спека, и ассеты: /api/docs-json, /api/docs-yaml, вложенные пути', async () => {
    for (const url of ['/api/docs-json', '/api/docs-yaml', '/api/docs/swagger-ui-init.js']) {
      const { reply, next } = await run(url, undefined, 'ok');
      expect(reply.statusCode).toBe(401);
      expect(next).not.toHaveBeenCalled();
    }
  });

  it('обход через percent-кодирование закрыт (роутер декодирует путь, как и проверка)', async () => {
    for (const url of [
      '/api/%64ocs',
      '/api/%64ocs-json',
      '/api/d%6Fcs-yaml',
      '/api/docs-json?x=%2F',
    ]) {
      const { reply, next } = await run(url, undefined, 'ok');
      expect(reply.statusCode, `для ${url}`).toBe(401);
      expect(next).not.toHaveBeenCalled();
    }
  });

  it('некорректный процент-код вне документации проходит (роутер его тоже не декодирует)', async () => {
    const { next } = await run('/api/v1/health/%zz', undefined, 'ok');
    expect(next).toHaveBeenCalledWith();
  });
});
