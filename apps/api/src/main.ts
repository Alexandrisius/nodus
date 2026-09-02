import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { validateEnv } from './core/config/env.schema.js';

async function bootstrap(): Promise<void> {
  // Fail-fast: кривое окружение — понятная ошибка до старта, а не в рантайме.
  const env = validateEnv();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      // traceId = UUID запроса; trustProxy — реальные IP за Caddy/Cloudflare Tunnel (аудит).
      genReqId: () => randomUUID(),
      trustProxy: true,
    }),
  );
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  app.setGlobalPrefix('api/v1');

  // Refresh-токен — в httpOnly-cookie (auth.controller).
  await app.register(fastifyCookie);

  // Rate limiting (навык auth-route-guards): login строже всего (брутфорс),
  // store in-memory достаточно для single-instance монолита. В тестах выключен —
  // интеграционные прогоны делают десятки логинов с одного IP.
  if (env.NODE_ENV !== 'test') {
    await app.register(fastifyRateLimit, {
      global: true,
      max: async (request) => {
        const url = request.url;
        if (url.startsWith('/api/v1/auth/login')) return 5;
        if (url.startsWith('/api/v1/auth/')) return 20;
        return 300;
      },
      timeWindow: '1 minute',
      keyGenerator: (request) => request.ip,
      errorResponseBuilder: (request, context) => ({
        code: 'RATE_LIMITED',
        message: `Too many requests, retry after ${context.after}`,
        traceId: String(request.id),
      }),
    });
  }

  await app.listen(env.API_PORT, '0.0.0.0');
}

void bootstrap();
