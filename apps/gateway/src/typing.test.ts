import { describe, expect, it, vi } from 'vitest';
import type { Socket } from 'socket.io';

import { convRoom, socketConvRooms } from './rooms.js';
import { TypingThrottler } from './typing.js';

const CONV = '00000000-0000-4000-8000-000000000001';

function fakeSocket(userId = 'user-1'): { socket: Socket; emit: ReturnType<typeof vi.fn> } {
  const emit = vi.fn();
  const socket = {
    id: 'socket-1',
    data: { userId },
    to: vi.fn().mockReturnValue({ emit }),
    join: vi.fn(async () => undefined),
  } as unknown as Socket;
  return { socket, emit };
}

describe('TypingThrottler', () => {
  it('пропускает событие в присоединённую беседу и троттлит повторы', () => {
    const throttler = new TypingThrottler();
    const { socket, emit } = fakeSocket();
    socketConvRooms(socket).add(convRoom(CONV));

    const t0 = new Date('2026-09-25T00:00:00Z');
    expect(throttler.handle(socket, { conversationId: CONV }, t0)).toBe(true);
    expect(emit).toHaveBeenCalledWith('chat.typing', { conversationId: CONV, userId: 'user-1' });

    expect(throttler.handle(socket, { conversationId: CONV }, new Date(t0.getTime() + 1000))).toBe(
      false,
    );
    expect(emit).toHaveBeenCalledTimes(1);

    const t3 = new Date(t0.getTime() + 3100);
    expect(throttler.handle(socket, { conversationId: CONV }, t3)).toBe(true);
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('игнорирует беседу, к которой сокет не присоединён', () => {
    const throttler = new TypingThrottler();
    const { socket, emit } = fakeSocket(); // без join
    expect(throttler.handle(socket, { conversationId: CONV })).toBe(false);
    expect(emit).not.toHaveBeenCalled();
  });

  it('игнорирует некорректный payload', () => {
    const throttler = new TypingThrottler();
    const { socket } = fakeSocket();
    socketConvRooms(socket).add(convRoom(CONV));
    expect(throttler.handle(socket, { conversationId: 'not-uuid' })).toBe(false);
    expect(throttler.handle(socket, null)).toBe(false);
  });

  it('forget чистит троттл пользователя', () => {
    const throttler = new TypingThrottler();
    const { socket } = fakeSocket();
    socketConvRooms(socket).add(convRoom(CONV));
    expect(throttler.handle(socket, { conversationId: CONV })).toBe(true);
    expect(throttler.handle(socket, { conversationId: CONV })).toBe(false);
    throttler.forget('user-1');
    expect(throttler.handle(socket, { conversationId: CONV })).toBe(true);
  });
});
