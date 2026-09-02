import { z } from 'zod';

import { ErrorCode } from './error-codes.js';

/**
 * Единый формат ошибки API (канон — `docs/architecture/api-conventions.md`).
 * `message` — английский технический (для логов/отладки); русские UI-строки
 * клиент берёт из i18n по `code` (I15).
 */
export const apiErrorResponseSchema = z.object({
  /** Код ошибки (системный из ErrorCode или доменный `MODULE_REASON`). */
  code: z.string().min(1),
  /** Техническое сообщение на английском. */
  message: z.string().min(1),
  /** Детали (например, `issues` при VALIDATION_FAILED). Без внутренностей сервера. */
  details: z.record(z.string(), z.unknown()).optional(),
  /** Идентификатор запроса для корреляции с логами (Fastify request.id). */
  traceId: z.string().min(1),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

/** Проверка, что код — системный (а не доменный `MODULE_REASON`). */
export function isSystemErrorCode(code: string): code is ErrorCode {
  return Object.values<string>(ErrorCode).includes(code);
}
