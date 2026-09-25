import { describe, expect, it, vi } from 'vitest';
import type { Server, Socket } from 'socket.io';

import { PRESENCE_ROOM } from './rooms.js';
import { PresenceTracker } from './presence.js';
import type { MembershipStore } from './membership.js';

const USER = '00000000-0000-4000-8000-0000000000a1';
const REF = { id: USER, displayName: 'Тестов Тест', avatarUrl: null };

function fakeIo() {
  const broadcast: { room: string; type: string; payload: unknown }[] = [];
  const io = {
    to(room: string) {
      return {
        emit(type: string, payload: unknown) {
          broadcast.push({ room, type, payload });
        },
      };
    },
  } as unknown as Server;
  return { io, broadcast };
}

function fakeSocket(id: string): Socket {
  return {
    id,
    data: { userId: USER },
    emit: vi.fn(),
    join: vi.fn(async () => undefined),
  } as unknown as Socket;
}

function fakeStore(): MembershipStore {
  return {
    isMember: vi.fn(),
    memberIds: vi.fn(),
    userRef: vi.fn(async () => REF),
  };
}

describe('PresenceTracker', () => {
  it('первое соединение: snapshot сокету + broadcast online', async () => {
    const { io, broadcast } = fakeIo();
    const tracker = new PresenceTracker(fakeStore(), io);
    const socket = fakeSocket('s1');

    await tracker.connect(socket);

    expect(socket.join).toHaveBeenCalledWith(PRESENCE_ROOM);
    expect(socket.emit).toHaveBeenCalledWith('presence.snapshot', {
      entries: [{ user: REF, status: 'online' }],
    });
    expect(broadcast).toEqual([
      { room: PRESENCE_ROOM, type: 'presence.updated', payload: { user: REF, status: 'online' } },
    ]);
  });

  it('второй сокет того же пользователя не транслирует online повторно', async () => {
    const { io, broadcast } = fakeIo();
    const tracker = new PresenceTracker(fakeStore(), io);
    await tracker.connect(fakeSocket('s1'));
    await tracker.connect(fakeSocket('s2'));

    expect(broadcast).toHaveLength(1); // только первый online
  });

  it('offline транслируется при разрыве последнего сокета', async () => {
    const { io, broadcast } = fakeIo();
    const tracker = new PresenceTracker(fakeStore(), io);
    const s1 = fakeSocket('s1');
    const s2 = fakeSocket('s2');
    await tracker.connect(s1);
    await tracker.connect(s2);

    tracker.disconnect(s1);
    expect(broadcast).toHaveLength(1); // ещё жив s2

    tracker.disconnect(s2);
    await vi.waitFor(() => {
      expect(broadcast).toHaveLength(2);
    });
    expect(broadcast[1]).toEqual({
      room: PRESENCE_ROOM,
      type: 'presence.updated',
      payload: { user: REF, status: 'offline' },
    });
  });
});
