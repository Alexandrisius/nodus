import fastifyCookie, { type FastifyCookieOptions } from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import type { FastifyMultipartOptions } from '@fastify/multipart';
import type { FastifyPluginCallback } from 'fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

/**
 * Сквозные Fastify-плагины приложения — единая точка для main.ts И
 * интеграционных фикстур (иначе фикстура молча расходится с прод-бутом:
 * #57 — вложения падали 415 без multipart).
 */
export async function registerCoreFastifyPlugins(app: NestFastifyApplication): Promise<void> {
  // Refresh-токен — в httpOnly-cookie (auth.controller).
  await app.register(fastifyCookie as FastifyPluginCallback<FastifyCookieOptions>);

  // Вложения чата (#57, ADR-0013): multipart-стрим через api в MinIO — без
  // буферизации; fileSize = жёсткий потолок хранилища 200 МБ (чат-лимит
  // 100 МБ проверяет сервис вложений по заявленному size до стрима).
  await app.register(fastifyMultipart as FastifyPluginCallback<FastifyMultipartOptions>, {
    limits: {
      fileSize: 200 * 1024 * 1024,
      files: 1,
      fields: 8,
      parts: 12,
    },
  });
}
