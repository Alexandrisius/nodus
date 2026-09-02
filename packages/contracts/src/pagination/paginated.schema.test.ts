import { describe, expect, it } from 'vitest';

import {
  cursorQuerySchema,
  PAGINATION_DEFAULT_LIMIT,
  paginatedSchema,
} from './paginated.schema.js';
import { z } from 'zod';

describe('paginatedSchema', () => {
  it('валидирует { items, nextCursor }', () => {
    const schema = paginatedSchema(z.object({ id: z.uuid() }));
    const parsed = schema.parse({
      items: [{ id: crypto.randomUUID() }],
      nextCursor: null,
    });
    expect(parsed.nextCursor).toBeNull();
  });
});

describe('cursorQuerySchema', () => {
  it('применяет лимит по умолчанию 50', () => {
    expect(cursorQuerySchema.parse({}).limit).toBe(PAGINATION_DEFAULT_LIMIT);
  });

  it('коерсит строковый limit и отсекает > 100', () => {
    expect(cursorQuerySchema.parse({ limit: '30' }).limit).toBe(30);
    expect(() => cursorQuerySchema.parse({ limit: 101 })).toThrow();
  });
});
