import type { ChatMessage } from '@nodus/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { EMPTY_DRAFT, useChatDrafts } from './chat-drafts.js';

const CONV = '11111111-1111-4111-8111-111111111111';
const KEY = `conversation:${CONV}`;

const msg = (id: string, text: string, threadRootId: string | null = null): ChatMessage => ({
  id,
  conversationId: CONV,
  author: { id: 'a1', displayName: 'Иванов И.И.', avatarUrl: null },
  text,
  replyToId: null,
  reply: null,
  threadRootId,
  threadRepliesCount: 0,
  reactions: [],
  attachments: [],
  editedAt: null,
  deletedAt: null,
  pinned: false,
  forwardedFrom: null,
  readAt: null,
  readBy: [],
  createdAt: '2026-09-24T09:00:00Z',
});

function reset() {
  useChatDrafts.setState({ drafts: {} });
}

describe('chat-drafts — режимы композера (A2/A4, #87)', () => {
  beforeEach(reset);

  it('setReply: снапшот плоский, текст черновика сохранён', () => {
    const store = useChatDrafts.getState();
    store.setText(KEY, 'черновик');
    store.setReply(KEY, msg('m1', 'оригинал с очень длинным текстом'));
    const draft = useChatDrafts.getState().drafts[KEY];
    expect(draft?.text).toBe('черновик');
    expect(draft?.reply?.messageId).toBe('m1');
    expect(draft?.reply?.snippet).toBe('оригинал с очень длинным текстом');
    expect(draft?.reply?.quoteText).toBeNull();
    expect(draft?.reply?.inThread).toBeNull();
  });

  it('частичная цитата: quoteText усекается до 160', () => {
    useChatDrafts.getState().setReply(KEY, msg('m1', 'оригинал'), 'ф'.repeat(200));
    const draft = useChatDrafts.getState().drafts[KEY];
    expect(draft?.reply?.quoteText).toHaveLength(160);
  });

  it('режимы взаимоисключающие: setEdit снимает ответ и прячет текст в preEditText', () => {
    const store = useChatDrafts.getState();
    store.setText(KEY, 'новый текст');
    store.setReply(KEY, msg('m1', 'оригинал'));
    store.setEdit(KEY, msg('m2', 'правлю меня'));
    const draft = useChatDrafts.getState().drafts[KEY];
    expect(draft?.reply).toBeNull();
    expect(draft?.edit?.messageId).toBe('m2');
    expect(draft?.text).toBe('правлю меня');
    expect(draft?.preEditText).toBe('новый текст');
  });

  it('cancelEdit восстанавливает исходный текст черновика', () => {
    const store = useChatDrafts.getState();
    store.setText(KEY, 'новый текст');
    store.setEdit(KEY, msg('m2', 'правлю меня'));
    store.cancelEdit(KEY);
    const draft = useChatDrafts.getState().drafts[KEY];
    expect(draft?.edit).toBeNull();
    expect(draft?.text).toBe('новый текст');
  });

  it('finishEdit (правка сохранена) — режим снят, черновик восстановлен', () => {
    const store = useChatDrafts.getState();
    store.setText(KEY, 'черновик');
    store.setEdit(KEY, msg('m2', 'правлю'));
    store.finishEdit(KEY);
    const draft = useChatDrafts.getState().drafts[KEY];
    expect(draft?.edit).toBeNull();
    expect(draft?.text).toBe('черновик');
  });

  it('пустой черновик удаляется из стора (индикатор в списке гаснет)', () => {
    const store = useChatDrafts.getState();
    store.setText(KEY, 'привет');
    expect(useChatDrafts.getState().drafts[KEY]).toBeDefined();
    store.setText(KEY, '');
    expect(useChatDrafts.getState().drafts[KEY]).toBeUndefined();
  });

  it('clear после отправки убирает всё', () => {
    const store = useChatDrafts.getState();
    store.setText(KEY, 'текст');
    store.setReply(KEY, msg('m1', 'оригинал'));
    store.clear(KEY);
    expect(useChatDrafts.getState().drafts[KEY] ?? EMPTY_DRAFT).toEqual(EMPTY_DRAFT);
  });
});
