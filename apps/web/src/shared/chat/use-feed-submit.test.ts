import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@nodus/contracts';

import { findLastMine } from './use-feed-submit.js';

/** ↑-правка последнего своего: живое, не пересланное, подтверждённое. */

const ME = 'me';
const msg = (id: string, over: Partial<ChatMessage> = {}): ChatMessage =>
  ({
    id,
    seq: 1,
    author: { id: ME, displayName: 'Я', avatarUrl: null },
    deletedAt: null,
    forwardedFrom: null,
    ...over,
  }) as ChatMessage;

describe('findLastMine', () => {
  it('берёт последнее своё подтверждённое', () => {
    const items = [
      msg('a'),
      msg('b'),
      msg('c', { author: { id: 'x', displayName: 'X', avatarUrl: null } }),
    ];
    expect(findLastMine(items, ME)?.id).toBe('b');
  });

  it('пропускает летящий темп, удалённое и пересланное', () => {
    const items = [
      msg('ok'),
      msg('fwd', { forwardedFrom: {} as ChatMessage['forwardedFrom'] }),
      msg('del', { deletedAt: '2026-10-07T10:00:00Z' }),
      msg('temp', { seq: 0 }),
    ];
    expect(findLastMine(items, ME)?.id).toBe('ok');
  });

  it('без пользователя — ничего', () => {
    expect(findLastMine([msg('a')], undefined)).toBeUndefined();
  });
});
