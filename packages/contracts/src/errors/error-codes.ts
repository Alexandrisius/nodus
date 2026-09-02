/**
 * Коды ошибок API (канон — `docs/architecture/api-conventions.md`).
 *
 * Системные коды обязательны к единому использованию всеми механизмами
 * (фильтр ошибок, пайпы, гварды, rate-limit). Доменные коды добавляются
 * модулями по маске `MODULE_REASON` (`TASK_INVALID_STAGE_TRANSITION`).
 * Каталог только расширяется: переименование кода ломает клиентов (i18n по коду, I15).
 */
export const ErrorCode = {
  /** zod/валидация входа; details.issues — список нарушений. */
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  /** Нет или просрочена аутентификация. */
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  /** Нет права (RBAC). */
  FORBIDDEN: 'FORBIDDEN',
  /** Сущность не найдена / нет доступа. */
  NOT_FOUND: 'NOT_FOUND',
  /** Конфликт состояния (в т.ч. идемпотентность с иным payload). */
  CONFLICT: 'CONFLICT',
  /** Превышен лимит запросов. */
  RATE_LIMITED: 'RATE_LIMITED',
  /** Непредвиденное (без деталей наружу). */
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Маска доменного кода: `MODULE_REASON` (SCREAMING_SNAKE с одним подчёркиванием-разделителем). */
export const DOMAIN_ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9]*_[A-Z0-9_]+$/;
