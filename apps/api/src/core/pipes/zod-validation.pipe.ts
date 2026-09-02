import { Injectable, type PipeTransform } from '@nestjs/common';
import { ErrorCode } from '@nodus/contracts';
import type { z } from 'zod';

import { DomainException } from '../errors/domain-exception.js';

/**
 * Канон валидации (patterns.md): схема из `@nodus/contracts` передаётся явно —
 * `@UsePipes(new ZodValidationPipe(createTaskSchema))`.
 * Любая ошибка валидации → `VALIDATION_FAILED` единого формата с `details.issues`.
 */
@Injectable()
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new DomainException(ErrorCode.VALIDATION_FAILED, 'Validation failed', {
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          code: issue.code,
          message: issue.message,
        })),
      });
    }
    return result.data;
  }
}
