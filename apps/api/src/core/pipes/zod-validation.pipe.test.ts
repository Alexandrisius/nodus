import { describe, expect, it } from 'vitest';
import { ErrorCode } from '@nodus/contracts';
import { z } from 'zod';

import { DomainException } from '../errors/domain-exception.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

const schema = z.object({
  title: z.string().min(1),
  limit: z.coerce.number().int().max(100).default(50),
});

describe('ZodValidationPipe', () => {
  it('возвращает распарсенное значение с применёнными дефолтами', () => {
    const pipe = new ZodValidationPipe(schema);
    expect(pipe.transform({ title: 'Задача' })).toEqual({ title: 'Задача', limit: 50 });
  });

  it('ошибка → DomainException VALIDATION_FAILED с details.issues', () => {
    const pipe = new ZodValidationPipe(schema);
    try {
      pipe.transform({ title: '', limit: 500 });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DomainException);
      const domainError = error as DomainException;
      expect(domainError.code).toBe(ErrorCode.VALIDATION_FAILED);
      const issues = domainError.details?.issues as Array<{ path: string }>;
      expect(issues.map((i) => i.path).sort()).toEqual(['limit', 'title']);
    }
  });
});
