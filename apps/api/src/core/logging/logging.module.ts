import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';

/**
 * Логирование (канон — patterns.md): nestjs-pino, traceId = Fastify request.id.
 * Секреты и чувствительные заголовки вырезаются redact-правилами —
 * в логах не должно быть паролей, токенов и cookie (опыт NormaCore, issue #2).
 */
@Module({
  imports: [
    PinoLoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["x-api-key"]',
            'req.headers["idempotency-key"]',
            'res.headers["set-cookie"]',
          ],
          censor: '[redacted]',
        },
        // traceId во всех request-логах = Fastify request.id (genReqId в main.ts).
        customProps: (req) => ({ traceId: String(req.id) }),
        // Health-checks из docker ходят каждые 10с — не зашумляем лог.
        autoLogging: {
          ignore: (req) => (req.url ?? '').startsWith('/api/v1/health'),
        },
      },
    }),
  ],
})
export class LoggingModule {}
