import { ErrorCode } from '@nodus/contracts';

/**
 * Единственный тип ошибок из сервисов (канон — patterns.md).
 * Несёт код из `@nodus/contracts` (системный ErrorCode или доменный
 * `MODULE_REASON`) и details. Маппинг в HTTP — глобальным фильтром
 * (`DomainExceptionFilter`), сервисы про HTTP не знают.
 */
export class DomainException extends Error {
  constructor(
    /** Системный ErrorCode или доменный код `MODULE_REASON`. */
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
    /** Явный HTTP-статус; по умолчанию выводится из кода фильтром. */
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'DomainException';
  }

  static notFound(message: string, details?: Record<string, unknown>): DomainException {
    return new DomainException(ErrorCode.NOT_FOUND, message, details);
  }

  static forbidden(message: string, details?: Record<string, unknown>): DomainException {
    return new DomainException(ErrorCode.FORBIDDEN, message, details);
  }

  static conflict(message: string, details?: Record<string, unknown>): DomainException {
    return new DomainException(ErrorCode.CONFLICT, message, details);
  }

  static unauthenticated(message = 'Authentication required'): DomainException {
    return new DomainException(ErrorCode.UNAUTHENTICATED, message);
  }
}
