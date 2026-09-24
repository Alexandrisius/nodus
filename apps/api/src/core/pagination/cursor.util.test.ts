import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ErrorCode } from '@nodus/contracts';

import { DomainException } from '../errors/domain-exception.js';
import { decodeCursor, encodeCursor } from './cursor.util.js';

const cursorSchema = z.object({ at: z.string().nullable(), id: z.string().uuid() });
const PAYLOAD = { at: '2026-09-24T10:00:00.000Z', id: '11111111-1111-4111-8111-111111111111' };

function expectInvalidCursor(raw: string): void {
  try {
    decodeCursor(raw, cursorSchema);
    expect.fail('decodeCursor должен бросить DomainException');
  } catch (error) {
    expect(error).toBeInstanceOf(DomainException);
    expect((error as DomainException).code).toBe(ErrorCode.VALIDATION_FAILED);
  }
}

describe('cursor.util', () => {
  it('encode → decode roundtrip (включая at: null)', () => {
    expect(decodeCursor(encodeCursor(PAYLOAD), cursorSchema)).toEqual(PAYLOAD);
    expect(decodeCursor(encodeCursor({ at: null, id: PAYLOAD.id }), cursorSchema)).toEqual({
      at: null,
      id: PAYLOAD.id,
    });
  });

  it('битый base64 → DomainException VALIDATION_FAILED', () => {
    expectInvalidCursor('это не курсор!');
  });

  it('валидный JSON не по схеме (нет id) → DomainException VALIDATION_FAILED', () => {
    expectInvalidCursor(encodeCursor({ at: null }));
    expectInvalidCursor(encodeCursor({ at: '2026-09-24T10:00:00.000Z', id: 'не-uuid' }));
  });

  it('валидный base64 невалидного JSON → DomainException', () => {
    expectInvalidCursor(Buffer.from('{не json', 'utf8').toString('base64url'));
  });

  it('пустая строка → DomainException VALIDATION_FAILED', () => {
    expectInvalidCursor('');
  });
});
