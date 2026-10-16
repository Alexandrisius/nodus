import { describe, expect, it, vi } from 'vitest';

import { emitTyping } from './typing-emitter.js';

vi.mock('./socket-client.js', () => ({
  getChatSocket: vi.fn(),
}));

import { getChatSocket } from './socket-client.js';

const socketMock = getChatSocket as unknown as ReturnType<typeof vi.fn>;

describe('emitTyping', () => {
  it('без соединения — тишина', () => {
    socketMock.mockReturnValue(null);
    emitTyping('conv-1');
    expect(socketMock).toHaveBeenCalled();
  });

  it('троттлится клиентом (~2 с) на беседу', () => {
    const emit = vi.fn();
    socketMock.mockReturnValue({ connected: true, emit });
    emitTyping('conv-1');
    expect(emit).toHaveBeenCalledTimes(1);
    emitTyping('conv-1'); // в пределах троттла — мимо
    expect(emit).toHaveBeenCalledTimes(1);
    emitTyping('conv-2'); // другая беседа — проходит
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenCalledWith('chat.typing', { conversationId: 'conv-2' });
  });

  it('чистка протухших отметок не ломает троттл соседей', () => {
    vi.useFakeTimers();
    try {
      const emit = vi.fn();
      socketMock.mockReturnValue({ connected: true, emit });
      emitTyping('conv-a');
      vi.advanceTimersByTime(2_100);
      emitTyping('conv-b'); // вычищает протухшую conv-a
      emitTyping('conv-b'); // свежая отметка conv-b жива — мимо
      emitTyping('conv-a'); // окно conv-a истекло — проходит
      expect(emit).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('отключённый сокет не эмитит', () => {
    const emit = vi.fn();
    socketMock.mockReturnValue({ connected: false, emit });
    emitTyping('conv-x');
    expect(emit).not.toHaveBeenCalled();
  });
});
