// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { applyRealtimeInvalidation } from './socket-invalidation.js';

/** queryClient-шпион: фиксирует инвалидированные ключи. */
function fakeQueryClient() {
  const invalidateQueries = vi.fn();
  return { client: { invalidateQueries }, invalidateQueries };
}

function envelope(type: string, payload: Record<string, unknown>) {
  return { type, payload, seq: 1, ts: '2026-09-25T00:00:00.000Z' };
}

const CONV = '00000000-0000-4000-8000-0000000000c1';

describe('applyRealtimeInvalidation', () => {
  it('message_sent: лента беседы (префикс покрывает треды) + список бесед', () => {
    const { client, invalidateQueries } = fakeQueryClient();
    applyRealtimeInvalidation(
      client as never,
      envelope('chat.message_sent', { conversationId: CONV }),
    );
    expect(invalidateQueries).toHaveBeenCalledTimes(2);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['chat', 'messages', CONV] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['chat', 'conversations'] });
  });

  it('message_read: галочки + бейджи — лента и список', () => {
    const { client, invalidateQueries } = fakeQueryClient();
    applyRealtimeInvalidation(
      client as never,
      envelope('chat.message_read', { conversationId: CONV }),
    );
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['chat', 'messages', CONV] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['chat', 'conversations'] });
  });

  it('reaction_added: только лента беседы', () => {
    const { client, invalidateQueries } = fakeQueryClient();
    applyRealtimeInvalidation(
      client as never,
      envelope('chat.reaction_added', { conversationId: CONV }),
    );
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['chat', 'messages', CONV] });
  });

  it('message_pinned: лента + закрепы', () => {
    const { client, invalidateQueries } = fakeQueryClient();
    applyRealtimeInvalidation(
      client as never,
      envelope('chat.message_pinned', { conversationId: CONV }),
    );
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['chat', 'messages', CONV] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['chat', 'pins', CONV] });
  });

  it('conversation_created: список бесед без ленты', () => {
    const { client, invalidateQueries } = fakeQueryClient();
    applyRealtimeInvalidation(
      client as never,
      envelope('chat.conversation_created', { memberIds: [] }),
    );
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['chat', 'conversations'] });
  });

  it('неизвестное событие и событие без беседы — тишина', () => {
    const { client, invalidateQueries } = fakeQueryClient();
    applyRealtimeInvalidation(client as never, envelope('task.updated', {}));
    applyRealtimeInvalidation(client as never, envelope('chat.reaction_added', {}));
    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});
