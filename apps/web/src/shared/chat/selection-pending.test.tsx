// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { ChatMessage } from '@nodus/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { useSelectionStore } from './selection-store.js';
import { confirmedIdsOf } from './selection-confirmed.js';
import { useFeedSelection } from './use-feed-selection.js';

/**
 * Селект при шквальной отправке (#243, регрессия владельца «последние
 * сообщения по одному снимают селект»): ключ выделения — clientMessageId,
 * стабильный через замену оптимистичного темпа (id=tempId) серверной
 * записью. Батч-команды получают только подтверждённые серверные id.
 */

const CONV = '11111111-1111-4111-8111-111111111111';

const msg = (n: number, clientMessageId: string, seq: number, text: string): ChatMessage => ({
  id: seq === 0 ? clientMessageId : `server-${n}`,
  conversationId: CONV,
  seq,
  clientMessageId,
  author: { id: 'me', displayName: 'Я', avatarUrl: null },
  text,
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
  createdAt: '2026-10-07T10:00:00Z',
});

beforeEach(() => {
  useSelectionStore.getState().exit();
});

describe('useFeedSelection — селект переживает замену темпа (#243)', () => {
  it('выделенные темпы остаются выделенными после подтверждения очереди', () => {
    // Шквал: три летящих темпа.
    const { result, rerender } = renderHook(
      ({ items }: { items: ChatMessage[] }) => useFeedSelection('conversation:c', items, 'me'),
      {
        initialProps: {
          items: [msg(1, 't1', 0, 'раз'), msg(2, 't2', 0, 'два'), msg(3, 't3', 0, 'три')],
        },
      },
    );

    // Пользователь выделил ВСЕ (включая летящие) — клавишей/кликами темпа.
    act(() => {
      result.current.toggle('t1', false);
      result.current.toggle('t2', false);
      result.current.toggle('t3', false);
    });
    expect(result.current.getSelectedMessages()).toHaveLength(3);

    // Очередь подтверждает: темпы заменяются серверными записями (ДРУГИЕ id).
    rerender({
      items: [msg(1, 't1', 5, 'раз'), msg(2, 't2', 6, 'два'), msg(3, 't3', 7, 'три')],
    });

    // Регрессия владельца: выделение НЕ слетает по одному.
    const selected = result.current.getSelectedMessages();
    expect(selected).toHaveLength(3);
    expect(selected.map((m) => m.seq)).toEqual([5, 6, 7]);
    // Серверные записи теперь выделяемы по тому же ключу.
    expect(result.current.selectedSet.has('t1')).toBe(true);
  });

  it('«тихое исключение» не трогает живые ключи при исчезновении одной записи', () => {
    const { result, rerender } = renderHook(
      ({ items }: { items: ChatMessage[] }) => useFeedSelection('conversation:c', items, 'me'),
      {
        initialProps: {
          items: [msg(1, 't1', 5, 'раз'), msg(2, 't2', 0, 'два')],
        },
      },
    );
    act(() => {
      result.current.toggle('t1', false);
      result.current.toggle('t2', false);
    });
    // Ошибочная отправка: темп ушёл, подтверждения не будет.
    rerender({ items: [msg(1, 't1', 5, 'раз')] });
    expect(result.current.getSelectedMessages().map((m) => m.clientMessageId)).toEqual(['t1']);
  });
});

describe('confirmedIdsOf — батч-команды только по подтверждённым (#243)', () => {
  it('летящий темп исключается, подтверждённые — своими серверными id', () => {
    const ids = confirmedIdsOf([msg(1, 't1', 5, 'раз'), msg(2, 't2', 0, 'два')]);
    expect(ids).toEqual(['server-1']);
  });

  it('без летящих — все id как есть', () => {
    const ids = confirmedIdsOf([msg(1, 't1', 5, 'раз'), msg(2, 't2', 6, 'два')]);
    expect(ids).toEqual(['server-1', 'server-2']);
  });
});
