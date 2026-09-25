import { describe, expect, it, vi } from 'vitest';
import type { Socket } from 'socket.io';

import { registerRoomHandlers, socketConvRooms, MAX_ROOMS_PER_SOCKET } from './rooms.js';
import type { MembershipStore } from './membership.js';

const CONV = '00000000-0000-4000-8000-0000000000c1';
const USER = '00000000-0000-4000-8000-0000000000a1';

/** Собирает сокет с перехватом обработчиков on(event, handler). */
function fakeSocket() {
  const handlers = new Map<string, (payload: unknown, ack?: (r: unknown) => void) => void>();
  const socket = {
    id: 's1',
    data: { userId: USER },
    on(event: string, handler: (payload: unknown, ack?: (r: unknown) => void) => void) {
      handlers.set(event, handler);
    },
    join: vi.fn(async () => undefined),
    leave: vi.fn(async () => undefined),
  } as unknown as Socket;
  return { socket, handlers };
}

function memberStore(member: boolean): MembershipStore {
  return {
    isMember: vi.fn(async () => member),
    memberIds: vi.fn(async () => []),
    userRef: vi.fn(),
  };
}

/** Вызвать conv:join и дождаться ack. */
function join(
  handlers: Map<string, (payload: unknown, ack?: (r: unknown) => void) => void>,
  payload: unknown,
): Promise<unknown> {
  return new Promise((resolve) => {
    handlers.get('conv:join')!(payload, resolve);
  });
}

describe('registerRoomHandlers (conv:join/leave)', () => {
  it('член беседы присоединяется с ok, повтор — идемпотентен', async () => {
    const { socket, handlers } = fakeSocket();
    registerRoomHandlers(socket, memberStore(true));

    await expect(join(handlers, { conversationId: CONV })).resolves.toEqual({ ok: true });
    expect(socket.join).toHaveBeenCalledTimes(1);
    expect(socketConvRooms(socket).size).toBe(1);

    await expect(join(handlers, { conversationId: CONV })).resolves.toEqual({ ok: true });
    expect(socket.join).toHaveBeenCalledTimes(1);
  });

  it('не-члену отказ без раскрытия причин (forbidden)', async () => {
    const { socket, handlers } = fakeSocket();
    registerRoomHandlers(socket, memberStore(false));
    await expect(join(handlers, { conversationId: CONV })).resolves.toEqual({
      ok: false,
      error: 'forbidden',
    });
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('некорректный payload отклоняется', async () => {
    const { socket, handlers } = fakeSocket();
    registerRoomHandlers(socket, memberStore(true));
    await expect(join(handlers, { conversationId: 'nope' })).resolves.toEqual({
      ok: false,
      error: 'bad_request',
    });
    await expect(join(handlers, null)).resolves.toMatchObject({ ok: false });
  });

  it('потолок комнат на сокет', async () => {
    const { socket, handlers } = fakeSocket();
    registerRoomHandlers(socket, memberStore(true));
    for (let i = 0; i < MAX_ROOMS_PER_SOCKET; i += 1) {
      const tail = String(i).padStart(12, '0');
      const uuid = `00000000-0000-4000-8000-${tail}`;
      await join(handlers, { conversationId: uuid });
    }
    await expect(join(handlers, { conversationId: CONV })).resolves.toEqual({
      ok: false,
      error: 'room_limit',
    });
  });

  it('conv:leave освобождает слот', async () => {
    const { socket, handlers } = fakeSocket();
    registerRoomHandlers(socket, memberStore(true));
    await join(handlers, { conversationId: CONV });
    handlers.get('conv:leave')!({ conversationId: CONV });
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
    expect(socketConvRooms(socket).size).toBe(0);
    await expect(join(handlers, { conversationId: CONV })).resolves.toEqual({ ok: true });
  });
});
