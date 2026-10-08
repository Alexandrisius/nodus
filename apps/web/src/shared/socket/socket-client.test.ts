// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { isFirstDelivery } from './socket-client.js';

/**
 * Дедуп доставки message_sent (#254): gateway fanout шлёт событие и в
 * conv-комнату, и в user-комнаты участников — клиент в открытой беседе
 * получает одно сообщение дважды; уведомления срабатывают только на первую
 * копию (иначе 2 попапа оболочки / 2 браузерных тоста на одно сообщение).
 */

const CONV = '00000000-0000-4000-8000-0000000000c1';
const OTHER = '00000000-0000-4000-8000-000000000002';

function messagePayload(id: string) {
  return {
    conversationId: CONV,
    messageId: id,
    seq: 1,
    authorId: OTHER,
    threadRootId: null,
    forwarded: false,
    urgent: false,
    mentionedUserIds: [],
    message: {
      id,
      conversationId: CONV,
      seq: 1,
      clientMessageId: `cli-${id}`,
      author: { id: OTHER, displayName: 'Иван Петрович Смирнов', avatarUrl: null },
      text: 'привет',
      replyToId: null,
      reply: null,
      deletedAt: null,
      pinned: false,
      forwardedFrom: null,
      threadRootId: null,
      threadRepliesCount: 0,
      reactions: [],
      attachments: [],
      editedAt: null,
      readAt: null,
      readBy: [],
      urgent: false,
      mentionedUserIds: [],
      linkPreview: null,
      createdAt: new Date().toISOString(),
    },
  };
}

describe('isFirstDelivery (дедуп fanout conv+user)', () => {
  it('первая копия — да, повтор той же — нет, другое сообщение — да', () => {
    const a = messagePayload('00000000-0000-4000-8000-0000000000a1');
    const b = messagePayload('00000000-0000-4000-8000-0000000000b2');
    expect(isFirstDelivery(a)).toBe(true);
    // Дубль доставки (conv-комната + user-комната) — гасится.
    expect(isFirstDelivery(structuredClone(a))).toBe(false);
    expect(isFirstDelivery(structuredClone(a))).toBe(false);
    // Другое сообщение — своя первая доставка.
    expect(isFirstDelivery(b)).toBe(true);
  });

  it('кривой payload не занимает место в дедупе', () => {
    expect(isFirstDelivery({ мусор: true })).toBe(true);
    expect(isFirstDelivery(null)).toBe(true);
    // Валидное сообщение после мусора — первая доставка как обычно.
    expect(isFirstDelivery(messagePayload('00000000-0000-4000-8000-0000000000c3'))).toBe(true);
  });
});
