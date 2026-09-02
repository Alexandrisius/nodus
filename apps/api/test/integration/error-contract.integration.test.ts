import 'reflect-metadata';
import { Body, Controller, Get, Module, Post, UsePipes } from '@nestjs/common';
import { APP_FILTER, NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { LoggerModule } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { apiErrorResponseSchema, ErrorCode } from '@nodus/contracts';

import { DomainException } from '../../src/core/errors/domain-exception.js';
import { DomainExceptionFilter } from '../../src/core/errors/domain-exception.filter.js';
import { ZodValidationPipe } from '../../src/core/pipes/zod-validation.pipe.js';

/**
 * Контракт ошибок на живом HTTP (критерий приёмки issue #2):
 * ошибка валидации из любого pipe даёт VALIDATION_FAILED единого формата;
 * непредвиденное → INTERNAL_ERROR без деталей наружу.
 */

const demoSchema = z.object({ title: z.string().min(1) });

@Controller('demo')
class DemoController {
  @Post()
  @UsePipes(new ZodValidationPipe(demoSchema))
  create(@Body() body: unknown) {
    return { ok: true, body };
  }

  @Get('domain')
  domainError(): never {
    throw new DomainException('TASK_INVALID_STAGE_TRANSITION', 'Invalid stage transition');
  }

  @Get('crash')
  crash(): never {
    throw new Error('internal detail: db password=secret123');
  }
}

@Module({
  imports: [LoggerModule.forRoot({ pinoHttp: { level: 'silent' } })],
  controllers: [DemoController],
  providers: [{ provide: APP_FILTER, useClass: DomainExceptionFilter }],
})
class DemoModule {}

describe('error contract (integration)', () => {
  let app: NestFastifyApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(DemoModule, new FastifyAdapter(), {
      logger: false,
    });
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('ошибка zod-валидации → 400 VALIDATION_FAILED с details.issues и traceId', async () => {
    const response = await fetch(`${baseUrl}/demo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '' }),
    });
    expect(response.status).toBe(400);
    const body = apiErrorResponseSchema.parse(await response.json());
    expect(body.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(body.traceId).toBeTruthy();
    expect(JSON.stringify(body.details)).toContain('title');
  });

  it('валидный запрос проходит pipe и доходит до контроллера', async () => {
    const response = await fetch(`${baseUrl}/demo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Задача' }),
    });
    expect(response.status).toBe(201);
  });

  it('доменное исключение → единый формат с доменным кодом', async () => {
    const response = await fetch(`${baseUrl}/demo/domain`);
    expect(response.status).toBe(400);
    const body = apiErrorResponseSchema.parse(await response.json());
    expect(body.code).toBe('TASK_INVALID_STAGE_TRANSITION');
  });

  it('непредвиденная ошибка → 500 INTERNAL_ERROR без внутренних деталей', async () => {
    const response = await fetch(`${baseUrl}/demo/crash`);
    expect(response.status).toBe(500);
    const body = apiErrorResponseSchema.parse(await response.json());
    expect(body.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(JSON.stringify(body)).not.toContain('password');
  });
});
