import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { PinoLogger } from 'nestjs-pino';
import { ErrorCode, type ApiErrorResponse } from '@nodus/contracts';

import { DomainException } from './domain-exception.js';

/** HTTP-статус для системного кода (канон формата — api-conventions.md). */
const CODE_TO_STATUS: Record<ErrorCode, number> = {
  [ErrorCode.VALIDATION_FAILED]: HttpStatus.BAD_REQUEST,
  [ErrorCode.UNAUTHENTICATED]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.FORBIDDEN]: HttpStatus.FORBIDDEN,
  [ErrorCode.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.CONFLICT]: HttpStatus.CONFLICT,
  [ErrorCode.RATE_LIMITED]: HttpStatus.TOO_MANY_REQUESTS,
  [ErrorCode.INTERNAL_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
};

/** Код для HTTP-исключений Nest/Fastify (400 у нас — всегда валидация входа). */
const STATUS_TO_CODE: Record<number, ErrorCode> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION_FAILED,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHENTICATED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMITED,
};

/**
 * Глобальный фильтр: любая ошибка → единый `{ code, message, details?, traceId }`.
 * DomainException маппится по коду (доменные `MODULE_REASON` по умолчанию → 400),
 * непредвиденное → 500 INTERNAL_ERROR без деталей наружу (error-details safety).
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(DomainExceptionFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();
    const traceId = String(request.id);

    const { status, body } = this.toResponse(exception, traceId);
    void reply.status(status).send(body);
  }

  private toResponse(
    exception: unknown,
    traceId: string,
  ): { status: number; body: ApiErrorResponse } {
    if (exception instanceof DomainException) {
      const status =
        exception.httpStatus ??
        CODE_TO_STATUS[exception.code as ErrorCode] ??
        HttpStatus.BAD_REQUEST; // доменные MODULE_REASON по умолчанию — 400
      this.logger.warn(
        { traceId, code: exception.code, details: exception.details },
        exception.message,
      );
      return {
        status,
        body: {
          code: exception.code,
          message: exception.message,
          ...(exception.details ? { details: exception.details } : {}),
          traceId,
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code =
        status >= HttpStatus.INTERNAL_SERVER_ERROR
          ? ErrorCode.INTERNAL_ERROR
          : (STATUS_TO_CODE[status] ?? ErrorCode.VALIDATION_FAILED);
      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logger.error({ traceId, err: exception }, exception.message);
      }
      return {
        status,
        body: { code, message: exception.message, traceId },
      };
    }

    // Непредвиденное: детали только в лог, наружу — без внутренностей.
    this.logger.error({ traceId, err: exception }, 'Unhandled exception');
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Internal server error',
        traceId,
      },
    };
  }
}
