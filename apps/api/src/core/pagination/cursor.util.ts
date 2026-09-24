import { z } from 'zod';

import { DomainException } from '../errors/domain-exception.js';
import { ErrorCode } from '@nodus/contracts';

/**
 * Opaque-курсор (канон — api-conventions.md): base64url(JSON), payload
 * валидируется zod-схемой владельца списка. Битый курсор — VALIDATION_FAILED,
 * а не молчаливый сброс на первую страницу (иначе тихая потеря данных).
 */
export function encodeCursor(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/** Декодирует курсор по схеме владельца (ключевые поля + типы). */
export function decodeCursor<T extends z.ZodType>(raw: string, schema: T): z.infer<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new DomainException(ErrorCode.VALIDATION_FAILED, 'Invalid cursor');
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new DomainException(ErrorCode.VALIDATION_FAILED, 'Invalid cursor');
  }
  return result.data;
}
