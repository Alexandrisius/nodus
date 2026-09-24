import type { ChatMessage, ConversationListItem } from '@nodus/contracts';
import { describe, expect, it } from 'vitest';

import {
  forwardFromLabel,
  forwardScopeKey,
  pendingFor,
  useForwardPending,
} from './forward-pending.js';

function message(id: string, authorId: string, displayName: string): ChatMessage {
  return {
    id,
    author: { id: authorId, displayName },
  } as ChatMessage;
}

function conversation(id: string, type: ConversationListItem['type']): ConversationListItem {
  return { id, type } as ConversationListItem;
}

describe('forwardScopeKey', () => {
  it('тред канала — scope треда', () => {
    expect(forwardScopeKey(conversation('c1', 'project_channel'), 'r1')).toBe('thread:r1');
  });
  it('канал без треда — лента feed', () => {
    expect(forwardScopeKey(conversation('c1', 'project_channel'), null)).toBe('feed:c1');
  });
  it('обычная беседа — conversation', () => {
    expect(forwardScopeKey(conversation('c2', 'task'), null)).toBe('conversation:c2');
  });
});

describe('forwardFromLabel', () => {
  const messages = [message('m1', 'me', 'Я'), message('m2', 'u1', 'Полина Винничер')];
  it('себя подписывает «Вы», порядок выделения', () => {
    expect(forwardFromLabel(['m1', 'm2'], messages, 'me')).toBe('Вы, Полина Винничер');
  });
  it('повторы автора схлопываются', () => {
    expect(forwardFromLabel(['m1', 'm1'], messages, 'me')).toBe('Вы');
  });
  it('больше двух авторов — первые два и +N', () => {
    const many = [...messages, message('m3', 'u2', 'Третий'), message('m4', 'u3', 'Четвёртый')];
    expect(forwardFromLabel(['m1', 'm2', 'm3', 'm4'], many, 'me')).toBe('Вы, Полина Винничер +2');
  });
  it('нет данных ленты — пустая строка (бар не падает)', () => {
    expect(forwardFromLabel(['m1'], undefined, 'me')).toBe('');
  });
});

describe('useForwardPending', () => {
  it('set кладёт бар per-scope, clear снимает только свой', () => {
    useForwardPending.getState().set({
      scopeKey: 'conversation:a',
      conversationId: 'a',
      threadRootId: null,
      sourceConversationId: 's',
      messageIds: ['m1'],
      fromLabel: 'Вы',
    });
    useForwardPending.getState().set({
      scopeKey: 'thread:r',
      conversationId: 'c',
      threadRootId: 'r',
      sourceConversationId: 's',
      messageIds: ['m2'],
      fromLabel: 'Полина Винничер',
    });
    expect(pendingFor('conversation:a')?.messageIds).toEqual(['m1']);
    expect(pendingFor('thread:r')?.fromLabel).toBe('Полина Винничер');
    useForwardPending.getState().clear('conversation:a');
    expect(pendingFor('conversation:a')).toBeNull();
    expect(pendingFor('thread:r')).not.toBeNull();
    useForwardPending.getState().clear('thread:r');
    expect(pendingFor('thread:r')).toBeNull();
  });
});
