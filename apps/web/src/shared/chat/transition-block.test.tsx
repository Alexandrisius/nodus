// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@nodus/contracts';

import { buildMessageItems } from './message-menu-items.js';
import { TransitionBlock } from './transition-block.js';

afterEach(cleanup);

const message: ChatMessage = {
  id: 'm1',
  conversationId: 'c1',
  seq: 5,
  clientMessageId: 'task-transition:event-1',
  author: { id: 'u1', displayName: 'Климович А.', avatarUrl: null },
  text: 'Ждём согласование заказчика',
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
  urgent: false,
  mentionedUserIds: [],
  linkPreview: null,
  kind: 'task_transition',
  block: {
    kind: 'task_transition',
    taskId: '00000000-0000-4000-8000-000000000001',
    recordId: '00000000-0000-4000-8000-000000000002',
    transitionName: 'Приостановить',
    fromStageName: 'В работе',
    toStageName: 'Приостановлена',
    commentLabel: 'Причина приостановки',
    result: { fileCount: 2, messageCount: 1 },
  },
  createdAt: '2026-10-25T10:00:00.000Z',
};

describe('блок перехода в ленте (#380)', () => {
  it('показывает кнопку, переход, подпись и текст причины, строку итога', () => {
    render(<TransitionBlock message={message} mine={false} showName avatarSlot="avatar" />);
    expect(screen.getByText('Приостановить')).toBeTruthy();
    expect(screen.getByText(/В работе → Приостановлена/)).toBeTruthy();
    expect(screen.getByText('Причина приостановки:')).toBeTruthy();
    expect(screen.getByText(/Ждём согласование заказчика/)).toBeTruthy();
    expect(screen.getByText(/Итог обновлён · 2 файла · 1 сообщение/)).toBeTruthy();
  });

  it('блок письма (#55): цель — чип цвета стадии, причина с подписью, без строки итога', () => {
    const letterMessage: ChatMessage = {
      ...message,
      text: 'Это счёт-фактура для бухгалтерии',
      kind: 'letter_transition',
      block: {
        kind: 'letter_transition',
        letterId: '00000000-0000-4000-8000-000000000003',
        recordId: '00000000-0000-4000-8000-000000000004',
        transitionName: 'Отменить регистрацию',
        fromStageName: 'На резолюции',
        toStageName: 'Ошибочно зарегистрировано',
        toStageColor: 'danger',
        commentLabel: 'Причина',
      },
    };
    render(<TransitionBlock message={letterMessage} mine={false} showName avatarSlot="avatar" />);
    expect(screen.getByText('Отменить регистрацию')).toBeTruthy();
    expect(
      screen.getByText('Ошибочно зарегистрировано').closest('span[class*="text-danger"]'),
    ).toBeTruthy();
    expect(screen.getByText('Причина:')).toBeTruthy();
    expect(screen.queryByText(/Итог обновлён/)).toBeNull();
  });

  it('в меню сообщения нет «Редактировать» у блока перехода', () => {
    const actions = Object.fromEntries(
      [
        'reply',
        'quoteFragment',
        'copy',
        'edit',
        'forward',
        'toTask',
        'markResult',
        'pin',
        'copyLink',
        'favorite',
        'select',
        'delete',
      ].map((key) => [key, vi.fn()]),
    ) as never;
    const { items } = buildMessageItems({
      message,
      mine: true,
      fragment: null,
      isFavorite: false,
      canModerate: true,
      hideFavorite: false,
      taskId: message.block?.kind === 'task_transition' ? message.block.taskId : undefined,
      actions,
    });
    expect(items.some((item) => item.id === 'edit')).toBe(false);
  });
});
