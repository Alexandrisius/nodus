import { describe, expect, it, vi } from 'vitest';
import type { Server, Socket } from 'socket.io';

import type { MembershipStore } from './membership.js';
import { convRoom, socketConvRooms, userRoom } from './rooms.js';
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

function fakeHarness(members: string[]) {
  const ioEmit = vi.fn();
  const io = { to: vi.fn().mockReturnValue({ emit: ioEmit }) } as unknown as Server;
  const store = { memberIds: vi.fn(async () => members) } as unknown as MembershipStore;
  return { io, store, ioEmit };
}

describe('TypingThrottler', () => {
  it('пропускает событие в присоединённую беседу и троттлит повторы', async () => {
    const { io, store } = fakeHarness(['user-1', 'user-2']);
    const throttler = new TypingThrottler(io, store);
    const { socket, emit } = fakeSocket();
    socketConvRooms(socket).add(convRoom(CONV));

    const t0 = new Date('2026-09-25T00:00:00Z');
    await expect(throttler.handle(socket, { conversationId: CONV }, t0)).resolves.toBe(true);
    expect(emit).toHaveBeenCalledWith('chat.typing', { conversationId: CONV, userId: 'user-1' });

    await expect(
      throttler.handle(socket, { conversationId: CONV }, new Date(t0.getTime() + 1000)),
    ).resolves.toBe(false);
    expect(emit).toHaveBeenCalledTimes(1);

    const t3 = new Date(t0.getTime() + 3100);
    await expect(throttler.handle(socket, { conversationId: CONV }, t3)).resolves.toBe(true);
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('рассылает в user-комнаты участников КРОМЕ автора (список чатов, раунд 2)', async () => {
    const { io, store, ioEmit } = fakeHarness(['user-1', 'user-2', 'user-3']);
    const throttler = new TypingThrottler(io, store);
    const { socket } = fakeSocket('user-1');
    socketConvRooms(socket).add(convRoom(CONV));

    await expect(throttler.handle(socket, { conversationId: CONV })).resolves.toBe(true);
    expect(io.to).toHaveBeenCalledWith([userRoom('user-2'), userRoom('user-3')]);
    expect(ioEmit).toHaveBeenCalledWith('chat.typing', { conversationId: CONV, userId: 'user-1' });
  });

  it('автор один в беседе — user-рассылки нет (скрывать нечего)', async () => {
    const { io, store, ioEmit } = fakeHarness(['user-1']);
    const throttler = new TypingThrottler(io, store);
    const { socket, emit } = fakeSocket('user-1');
    socketConvRooms(socket).add(convRoom(CONV));

    await expect(throttler.handle(socket, { conversationId: CONV })).resolves.toBe(true);
    expect(io.to).not.toHaveBeenCalled();
    expect(ioEmit).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledTimes(1); // комната беседы — как обычно
  });

  it('игнорирует беседу, к которой сокет не присоединён', async () => {
    const { io, store, ioEmit } = fakeHarness(['user-1', 'user-2']);
    const throttler = new TypingThrottler(io, store);
    const { socket, emit } = fakeSocket(); // без join
    await expect(throttler.handle(socket, { conversationId: CONV })).resolves.toBe(false);
    expect(emit).not.toHaveBeenCalled();
    expect(ioEmit).not.toHaveBeenCalled();
  });

  it('игнорирует некорректный payload', async () => {
    const { io, store } = fakeHarness(['user-1', 'user-2']);
    const throttler = new TypingThrottler(io, store);
    const { socket } = fakeSocket();
    socketConvRooms(socket).add(convRoom(CONV));
    await expect(throttler.handle(socket, { conversationId: 'not-uuid' })).resolves.toBe(false);
    await expect(throttler.handle(socket, null)).resolves.toBe(false);
  });

  it('ошибка PG в memberIds НЕ бросает и не роняет процесс (валидатор р.2)', async () => {
    const ioEmit = vi.fn();
    const io = { to: vi.fn().mockReturnValue({ emit: ioEmit }) } as unknown as Server;
    const store = {
      memberIds: vi.fn(async () => {
        throw new Error('pg down');
      }),
    } as unknown as MembershipStore;
    const throttler = new TypingThrottler(io, store);
    const { socket, emit } = fakeSocket('user-1');
    socketConvRooms(socket).add(convRoom(CONV));

    // conv-рассылка ушла, user-хвост проглочен — handle разрешается true.
    await expect(throttler.handle(socket, { conversationId: CONV })).resolves.toBe(true);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(ioEmit).not.toHaveBeenCalled();
  });

  it('forget чистит троттл пользователя', async () => {
    const { io, store } = fakeHarness(['user-1']);
    const throttler = new TypingThrottler(io, store);
    const { socket } = fakeSocket();
    socketConvRooms(socket).add(convRoom(CONV));
    await expect(throttler.handle(socket, { conversationId: CONV })).resolves.toBe(true);
    await expect(throttler.handle(socket, { conversationId: CONV })).resolves.toBe(false);
    throttler.forget('user-1');
    await expect(throttler.handle(socket, { conversationId: CONV })).resolves.toBe(true);
  });
});
