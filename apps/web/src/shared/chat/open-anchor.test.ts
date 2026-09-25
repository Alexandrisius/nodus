import { describe, expect, it } from 'vitest';
import type { ConversationListItem } from '@nodus/contracts';

import { decideOpenAnchor } from './open-anchor.js';
import { JUMP_TTL_MS, type JumpTarget } from './jump-store.js';

/** Решение об якоре открытия ленты (раунд 4): jump побеждает непрочитанных,
 *  без jump — unreadCount>0 → якорь, иначе обычное открытие. */

const conv = (unreadCount: number, myLastReadSeq = 3): ConversationListItem =>
  ({
    id: 'conv-1',
    type: 'group',
    unreadCount,
    myLastReadSeq,
  }) as ConversationListItem;

const jump = (overrides: Partial<JumpTarget> = {}): JumpTarget => ({
  conversationId: 'conv-1',
  threadRootId: null,
  messageId: 'm-9',
  nonce: 7,
  requestedAt: Date.now(),
  ...overrides,
});

describe('decideOpenAnchor', () => {
  it('непрочитанные есть → якорь на первом непрочитанном', () => {
    const d = decideOpenAnchor('conv-1', conv(5), { jumpTarget: null });
    expect(d).toEqual({ anchoring: true, jump: null });
  });

  it('непрочитанных нет → обычное открытие (низ)', () => {
    const d = decideOpenAnchor('conv-1', conv(0), { jumpTarget: null });
    expect(d).toEqual({ anchoring: false, jump: null });
  });

  it('список не грузится (conversation=null, таймаут гейта) → без якоря', () => {
    const d = decideOpenAnchor('conv-1', null, { jumpTarget: null });
    expect(d).toEqual({ anchoring: false, jump: null });
  });

  it('активный jump-запрос беседы ПОБЕЖДАЕТ якорь непрочитанных (фикс 7)', () => {
    const d = decideOpenAnchor('conv-1', conv(40), { jumpTarget: jump() });
    expect(d.anchoring).toBe(true);
    expect(d.jump).toEqual({ messageId: 'm-9', nonce: 7 });
  });

  it('jump другой беседы не влияет: якорь по непрочитанным', () => {
    const d = decideOpenAnchor('conv-1', conv(2), {
      jumpTarget: jump({ conversationId: 'conv-other' }),
    });
    expect(d).toEqual({ anchoring: true, jump: null });
  });

  it('jump-запрос в ТРЕД не подавляет якорь ленты (тред — своё окно)', () => {
    const d = decideOpenAnchor('conv-1', conv(2), {
      jumpTarget: jump({ threadRootId: 'root-1' }),
    });
    expect(d).toEqual({ anchoring: true, jump: null });
  });

  it('протухший jump (TTL) — якорь по непрочитанным', () => {
    const now = Date.now();
    const d = decideOpenAnchor('conv-1', conv(1), {
      jumpTarget: jump({ requestedAt: now - JUMP_TTL_MS - 1 }),
      now,
    });
    expect(d).toEqual({ anchoring: true, jump: null });
  });

  it('jump на границе TTL ещё жив', () => {
    const now = Date.now();
    const d = decideOpenAnchor('conv-1', conv(1), {
      jumpTarget: jump({ requestedAt: now - JUMP_TTL_MS }),
      now,
    });
    expect(d.jump).toEqual({ messageId: 'm-9', nonce: 7 });
  });
});
