// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { RealtimeEnvelope } from '@nodus/contracts';

import { createRealtimeInvalidator } from './socket-invalidation.js';

/** queryClient-шпион: фиксирует инвалидированные ключи; кэшей нет (ws-apply
 *  вернёт false — message_sent обязан дойти до коалесцированного рефеча). */
function fakeQueryClient() {
  const invalidateQueries = vi.fn();
  const getQueryData = vi.fn(() => undefined);
  return { client: { invalidateQueries, getQueryData }, invalidateQueries };
}

function envelope(type: string, payload: Record<string, unknown>): RealtimeEnvelope {
  return { type, payload, seq: 1, ts: '2026-09-25T00:00:00.000Z' };
}

const CONV = '00000000-0000-4000-8000-0000000000c1';

/** Прокрутить ярусы окон батчера (feed 150 / list 600 мс). */
function flushWindows(): void {
  vi.advanceTimersByTime(700);
}

describe('createRealtimeInvalidator (коалесцинг, раунд 3)', () => {
  it('message_sent без DTO в кэше: лента + состояния трэдов + список (по окнам)', () => {
    vi.useFakeTimers();
    const { client, invalidateQueries } = fakeQueryClient();
    const invalidator = createRealtimeInvalidator(client as never);
    invalidator.handle(envelope('chat.message_sent', { conversationId: CONV }));
    flushWindows();
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['chat', 'messages', CONV] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['chat', 'threadStates', CONV] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['chat', 'conversations'] });
    invalidator.dispose();
    vi.useRealTimers();
  });

  it('бурст 30 событий одной беседы: каждый ключ ОДИН раз за окно (гистерезис)', () => {
    vi.useFakeTimers();
    const { client, invalidateQueries } = fakeQueryClient();
    const invalidator = createRealtimeInvalidator(client as never);
    for (let i = 0; i < 30; i += 1) {
      invalidator.handle(envelope('chat.message_sent', { conversationId: CONV, seq: i + 1 }));
    }
    flushWindows();
    const calls = invalidateQueries.mock.calls.filter(
      (c) => (c[0] as { queryKey: unknown[] }).queryKey[1] === 'conversations',
    );
    expect(calls.length).toBe(1);
    const feed = invalidateQueries.mock.calls.filter(
      (c) => (c[0] as { queryKey: unknown[] }).queryKey[1] === 'messages',
    );
    expect(feed.length).toBe(1);
    invalidator.dispose();
    vi.useRealTimers();
  });

  it('message_read: галочки + бейджи + точки трэдов', () => {
    vi.useFakeTimers();
    const { client, invalidateQueries } = fakeQueryClient();
    const invalidator = createRealtimeInvalidator(client as never);
    invalidator.handle(envelope('chat.message_read', { conversationId: CONV }));
    flushWindows();
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['chat', 'messages', CONV] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['chat', 'threadStates', CONV] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['chat', 'conversations'] });
    invalidator.dispose();
    vi.useRealTimers();
  });

  it('reaction_added: только лента беседы (и состояния трэдов)', () => {
    vi.useFakeTimers();
    const { client, invalidateQueries } = fakeQueryClient();
    const invalidator = createRealtimeInvalidator(client as never);
    invalidator.handle(envelope('chat.reaction_added', { conversationId: CONV }));
    flushWindows();
    expect(invalidateQueries).toHaveBeenCalledTimes(2);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['chat', 'messages', CONV] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['chat', 'threadStates', CONV] });
    invalidator.dispose();
    vi.useRealTimers();
  });

  it('message_pinned: лента + закрепы', () => {
    vi.useFakeTimers();
    const { client, invalidateQueries } = fakeQueryClient();
    const invalidator = createRealtimeInvalidator(client as never);
    invalidator.handle(envelope('chat.message_pinned', { conversationId: CONV }));
    flushWindows();
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['chat', 'messages', CONV] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['chat', 'pins', CONV] });
    invalidator.dispose();
    vi.useRealTimers();
  });

  it('conversation_created: список бесед без ленты', () => {
    vi.useFakeTimers();
    const { client, invalidateQueries } = fakeQueryClient();
    const invalidator = createRealtimeInvalidator(client as never);
    invalidator.handle(envelope('chat.conversation_created', { memberIds: [] }));
    flushWindows();
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['chat', 'conversations'] });
    invalidator.dispose();
    vi.useRealTimers();
  });

  it('неизвестное событие и событие без беседы — тишина', () => {
    vi.useFakeTimers();
    const { client, invalidateQueries } = fakeQueryClient();
    const invalidator = createRealtimeInvalidator(client as never);
    invalidator.handle(envelope('task.updated', {}));
    invalidator.handle(envelope('chat.reaction_added', {}));
    flushWindows();
    expect(invalidateQueries).not.toHaveBeenCalled();
    invalidator.dispose();
    vi.useRealTimers();
  });
});
