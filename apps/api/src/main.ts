import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
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
  await app.listen(env.API_PORT, '0.0.0.0');
}

void bootstrap();
