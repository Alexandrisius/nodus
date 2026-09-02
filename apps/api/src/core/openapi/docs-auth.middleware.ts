import type { IncomingMessage, ServerResponse } from 'node:http';
import { ErrorCode } from '@nodus/contracts';

/** Верификация access-токена (делегирование в auth-модуль, см. openapi.setup). */
export type VerifyAccessToken = (token: string) => Promise<unknown>;

/** Все варианты публикации спеки и UI: /api/docs, /api/docs-json, /api/docs-yaml, ассеты. */
export const DOCS_URL_PREFIX = '/api/docs';

/** Сырой запрос, как его передаёт middie (fastify кладёт `id` на req.raw перед запуском). */
type RawRequest = IncomingMessage & { id: string };

/**
 * Защита маршрутов документации (`/api/docs*`): только авторизованные (issue #19, I2).
 *
 * Реализован middie-посредником, а не гуардом: `SwaggerModule.setup` регистрирует
 * маршруты напрямую в HTTP-адаптере (`httpAdapter.get`), в обход конвейера Nest —
 * глобальный `JwtAuthGuard` на них не действует (подтверждено исходниками
 * @nestjs/swagger: serveSwaggerUi/serveDefinitions).
 *
 * ВАЖНО: на Fastify адаптер передаёт в посредники СЫРЫЕ объекты Node
 * (`req.raw`, `reply.raw`) — не `FastifyRequest`/`FastifyReply` (см.
 * `fastify-middie.js`: `this[kMiddie].run(req.raw, reply.raw, next)`).
 * Ответ поэтому пишется в `ServerResponse` напрямую; `next()` в отказе
 * не вызывается — запрос дальше маршрутов не идёт.
 *
 * Формат отказа — единый формат ошибок API (api-conventions.md):
 * `{ code: UNAUTHENTICATED, message, traceId }`, HTTP 401.
 */
export function createDocsAuthMiddleware(verifyAccessToken: VerifyAccessToken) {
  return async (
    request: RawRequest,
    reply: ServerResponse,
    next: (err?: Error) => void,
  ): Promise<void> => {
    if (!request.url?.startsWith(DOCS_URL_PREFIX)) {
      next();
      return;
    }

    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
      rejectUnauthenticated(request, reply, 'Authentication required');
      return;
    }

    try {
      await verifyAccessToken(token);
    } catch {
      rejectUnauthenticated(request, reply, 'Access token expired or invalid');
      return;
    }
    next();
  };
}

function rejectUnauthenticated(request: RawRequest, reply: ServerResponse, message: string): void {
  reply.statusCode = 401;
  reply.setHeader('Content-Type', 'application/json; charset=utf-8');
  reply.end(
    JSON.stringify({
      code: ErrorCode.UNAUTHENTICATED,
      message,
      traceId: request.id,
    }),
  );
}
