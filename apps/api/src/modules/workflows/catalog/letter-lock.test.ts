import { ErrorCode } from '@nodus/contracts';
import { describe, expect, it } from 'vitest';

import { assertLetterCatalogEditable, isLetterCatalogLocked } from './letter-lock.js';

describe('замок каталога писем (#55, Р4/O4)', () => {
  it('оба направления писем заперты до #463/#464', () => {
    expect(isLetterCatalogLocked('incoming')).toBe(true);
    expect(isLetterCatalogLocked('outgoing')).toBe(true);
    expect(isLetterCatalogLocked(null)).toBe(false);
    expect(isLetterCatalogLocked('task')).toBe(false);
  });

  it('правка типа письма — 409 PROCESS_TYPE_SYSTEM_LOCKED с причиной', () => {
    expect(() =>
      assertLetterCatalogEditable({ category: 'letter', direction: 'incoming' }),
    ).toThrowError(
      expect.objectContaining({
        code: ErrorCode.PROCESS_TYPE_SYSTEM_LOCKED,
        details: expect.objectContaining({ reason: 'letter_catalog' }),
      }),
    );
  });

  it('задачи не задеты замком', () => {
    expect(() => assertLetterCatalogEditable({ category: 'task', direction: null })).not.toThrow();
  });
});
