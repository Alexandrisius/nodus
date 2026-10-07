// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(cleanup);
import type { ChatMessage } from '@nodus/contracts';

import { UrgentChip, UrgentChips } from './urgent-chips.js';

/** Чип «Важное» на пузыре (#177, ревизия 05.10): иконка + слово, всем
 *  участникам; ack-механики нет. Не-urgent и надгробие — чипа нет. */

const CONV = '11111111-1111-4111-8111-111111111111';
const MSG = '22222222-2222-4222-8222-222222222222';

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: MSG,
    conversationId: CONV,
    seq: 1,
    clientMessageId: 'client-1',
    author: { id: 'a-1', displayName: 'Анна Смирнова', avatarUrl: null },
    text: 'Завтра объект закрыт',
    replyToId: null,
    reply: null,
    threadRootId: null,
    threadRepliesCount: 0,
    reactions: [],
    attachments: [],
    editedAt: null,
    deletedAt: null,
    pinned: false,
    forwardedFrom: null,
    readAt: null,
    readBy: [],
    urgent: true,
    mentionedUserIds: [],
    linkPreview: null,
    createdAt: '2026-10-05T10:00:00Z',
    ...overrides,
  };
}

function renderWith(node: ReactNode) {
  return render(node);
}

describe('UrgentChips (#177)', () => {
  it('важное — чип со словом «Важное» виден всем', () => {
    const { container, getByText } = renderWith(
      createElement(UrgentChips, { message: makeMessage() }),
    );
    expect(getByText('Важное')).toBeDefined();
    expect(container.querySelector('[data-slot="urgent-chip"]')).not.toBeNull();
  });

  it('не-urgent сообщение — чипа нет', () => {
    const { container } = renderWith(
      createElement(UrgentChips, { message: makeMessage({ urgent: false }) }),
    );
    expect(container.querySelector('[data-slot="urgent-chips"]')).toBeNull();
  });

  it('надгробие — чипа нет (контент обнулён)', () => {
    const { container } = renderWith(
      createElement(UrgentChips, {
        message: makeMessage({ deletedAt: '2026-10-05T11:00:00Z' }),
      }),
    );
    expect(container.querySelector('[data-slot="urgent-chips"]')).toBeNull();
  });

  it('inline-вариант — тот же чип (пост-карточка)', () => {
    const { getByText } = renderWith(
      createElement(UrgentChips, { message: makeMessage(), inline: true }),
    );
    expect(getByText('Важное')).toBeDefined();
  });
});

describe('UrgentChip (#177)', () => {
  it('отдельный чип для bare-медиа — слово и иконка', () => {
    const { getByText } = renderWith(createElement(UrgentChip));
    expect(getByText('Важное')).toBeDefined();
  });
});
