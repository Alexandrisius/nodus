import { describe, expect, it, vi } from 'vitest';
import type { Server } from 'socket.io';
import type { Redis } from 'ioredis';
import { DOMAIN_EVENTS_STREAM, type RealtimeEnvelope } from '@nodus/contracts';

import { ChatEventsConsumer } from './fanout.js';

import { routeEnvelope, USER_DEACTIVATED_EVENT } from './route-envelope.js';
import type { MembershipStore } from './membership.js';

const CONV = '00000000-0000-4000-8000-0000000000c1';
const USER_A = '00000000-0000-4000-8000-0000000000a1';
const USER_B = '00000000-0000-4000-8000-0000000000a2';

/** io.to(room).emit(type, envelope) → список [room, type]. */
function fakeIo() {
  const calls: { room: string; type: string; envelope: RealtimeEnvelope }[] = [];
  const io = {
    to(room: string) {
      return {
        emit(type: string, envelope: RealtimeEnvelope) {
          calls.push({ room, type, envelope });
        },
      };
    },
  } as unknown as Server;
  return { io, calls };
}

function envelope(type: string, payload: Record<string, unknown>): RealtimeEnvelope {
  return { type, payload, seq: 1, ts: '2026-09-25T00:00:00.000Z' };
}

describe('routeEnvelope', () => {
  it('message_sent: комната беседы + user-комнаты участников (список бесед)', async () => {
    const { io, calls } = fakeIo();
    const store: MembershipStore = {
      isMember: vi.fn(),
      memberIds: vi.fn(async () => [USER_A, USER_B]),
      userRef: vi.fn(),
    };
    await routeEnvelope(io, store, envelope('chat.message_sent', { conversationId: CONV, seq: 5 }));
    expect(calls.map((c) => c.room)).toEqual([`conv:${CONV}`, `user:${USER_A}`, `user:${USER_B}`]);
  });

  it('reaction_added: только комната беседы (список бесед не меняется)', async () => {
    const { io, calls } = fakeIo();
    const store: MembershipStore = {
      isMember: vi.fn(),
      memberIds: vi.fn(async () => [USER_A]),
      userRef: vi.fn(),
    };
    await routeEnvelope(io, store, envelope('chat.reaction_added', { conversationId: CONV }));
    expect(calls.map((c) => c.room)).toEqual([`conv:${CONV}`]);
  });

  it('message_read: комната беседы + user-комната читателя', async () => {
    const { io, calls } = fakeIo();
    const store: MembershipStore = { isMember: vi.fn(), memberIds: vi.fn(), userRef: vi.fn() };
    await routeEnvelope(
      io,
      store,
      envelope('chat.message_read', { conversationId: CONV, userId: USER_A, upToSeq: 4 }),
    );
    expect(calls.map((c) => c.room)).toEqual([`conv:${CONV}`, `user:${USER_A}`]);
  });

  it('conversation_created: user-комнаты первичных участников', async () => {
    const { io, calls } = fakeIo();
    const store: MembershipStore = { isMember: vi.fn(), memberIds: vi.fn(), userRef: vi.fn() };
    await routeEnvelope(
      io,
      store,
      envelope('chat.conversation_created', { memberIds: [USER_A, USER_B] }),
    );
    expect(calls.map((c) => c.room)).toEqual([`user:${USER_A}`, `user:${USER_B}`]);
  });

  it('member_added: комната беседы + user-комнаты добавленных', async () => {
    const { io, calls } = fakeIo();
    const store: MembershipStore = { isMember: vi.fn(), memberIds: vi.fn(), userRef: vi.fn() };
    await routeEnvelope(
      io,
      store,
      envelope('chat.member_added', { conversationId: CONV, userIds: [USER_B] }),
    );
    expect(calls.map((c) => c.room)).toEqual([`conv:${CONV}`, `user:${USER_B}`]);
  });

  it('conversation_updated (#186): комната беседы + user-комнаты участников (название/аватар в списке)', async () => {
    const { io, calls } = fakeIo();
    const store: MembershipStore = {
      isMember: vi.fn(),
      memberIds: vi.fn(async () => [USER_A, USER_B]),
      userRef: vi.fn(),
    };
    await routeEnvelope(
      io,
      store,
      envelope('chat.conversation_updated', { conversationId: CONV, title: 'Новое' }),
    );
    expect(calls.map((c) => c.room)).toEqual([`conv:${CONV}`, `user:${USER_A}`, `user:${USER_B}`]);
  });

  it('member_removed (#186/#252): комнаты + сокеты исключённого выходят из беседы', async () => {
    const { io, calls } = fakeIo();
    const socket = {
      data: { convRooms: new Set([`conv:${CONV}`, 'conv:other']) },
      leave: vi.fn(),
    };
    const inRoom = vi.fn(() => ({ fetchSockets: async () => [socket] }));
    (io as unknown as { in: typeof inRoom }).in = inRoom;
    const store: MembershipStore = { isMember: vi.fn(), memberIds: vi.fn(), userRef: vi.fn() };
    await routeEnvelope(
      io,
      store,
      envelope('chat.member_removed', { conversationId: CONV, userId: USER_B, actorId: USER_A }),
    );
    expect(calls.map((c) => c.room)).toEqual([`conv:${CONV}`, `user:${USER_B}`]);
    expect(inRoom).toHaveBeenCalledWith(`user:${USER_B}`);
    expect(socket.leave).toHaveBeenCalledWith(`conv:${CONV}`);
    expect([...socket.data.convRooms]).toEqual(['conv:other']);
  });

  it('member_role_changed (#186): комната беседы + user-комната целевого', async () => {
    const { io, calls } = fakeIo();
    const store: MembershipStore = { isMember: vi.fn(), memberIds: vi.fn(), userRef: vi.fn() };
    await routeEnvelope(
      io,
      store,
      envelope('chat.member_role_changed', {
        conversationId: CONV,
        userId: USER_B,
        role: 'admin',
        actorId: USER_A,
      }),
    );
    expect(calls.map((c) => c.room)).toEqual([`conv:${CONV}`, `user:${USER_B}`]);
  });

  it('notification.dispatch_requested: user-комната получателя (snapshot.userId)', async () => {
    const { io, calls } = fakeIo();
    const store: MembershipStore = { isMember: vi.fn(), memberIds: vi.fn(), userRef: vi.fn() };
    await routeEnvelope(
      io,
      store,
      envelope('notification.dispatch_requested', {
        snapshot: { notificationId: 'n1', userId: USER_B, priority: 'high' },
        attempt: 0,
        seq: 9,
      }),
    );
    expect(calls.map((c) => c.room)).toEqual([`user:${USER_B}`]);
    expect(calls[0]!.type).toBe('notification.dispatch_requested');
  });

  it('notification.read/acked: user-комната из payload.userId', async () => {
    const { io, calls } = fakeIo();
    const store: MembershipStore = { isMember: vi.fn(), memberIds: vi.fn(), userRef: vi.fn() };
    await routeEnvelope(io, store, envelope('notification.read', { userId: USER_A }));
    await routeEnvelope(
      io,
      store,
      envelope('notification.acked', { userId: USER_B, messageId: 'm1' }),
    );
    expect(calls.map((c) => c.room)).toEqual([`user:${USER_A}`, `user:${USER_B}`]);
  });

  it('task.* (#37): user-комнаты аудитории задачи', async () => {
    const { io, calls } = fakeIo();
    const store: MembershipStore = { isMember: vi.fn(), memberIds: vi.fn(), userRef: vi.fn() };
    await routeEnvelope(
      io,
      store,
      envelope('task.stage_changed', { taskId: 't1', number: 1, audience: [USER_A, USER_B] }),
    );
    await routeEnvelope(io, store, envelope('task.updated', { taskId: 't1' }));
    expect(calls.map((c) => c.room)).toEqual([`user:${USER_A}`, `user:${USER_B}`]);
  });

  it('неизвестный доменный тип (стрим общий) — игнор без ошибок', async () => {
    const { io, calls } = fakeIo();
    const store: MembershipStore = { isMember: vi.fn(), memberIds: vi.fn(), userRef: vi.fn() };
    await routeEnvelope(io, store, envelope('file.preview_ready', { fileId: 'f1' }));
    expect(calls).toHaveLength(0);
  });

  it('directory.user.deactivated: все сокеты пользователя отключаются (с закрытием транспорта)', async () => {
    const { io, calls } = fakeIo();
    const disconnectSockets = vi.fn();
    const inRoom = vi.fn(() => ({ disconnectSockets }));
    (io as unknown as { in: typeof inRoom }).in = inRoom;
    const store: MembershipStore = { isMember: vi.fn(), memberIds: vi.fn(), userRef: vi.fn() };

    await routeEnvelope(io, store, envelope(USER_DEACTIVATED_EVENT, { userId: USER_B }));

    expect(inRoom).toHaveBeenCalledWith(`user:${USER_B}`);
    expect(disconnectSockets).toHaveBeenCalledWith(true);
    expect(calls).toHaveLength(0); // событие клиентам не ретранслируется
  });

  it('directory.user.deactivated без userId — ничего не отключаем', async () => {
    const { io } = fakeIo();
    const inRoom = vi.fn();
    (io as unknown as { in: typeof inRoom }).in = inRoom;
    const store: MembershipStore = { isMember: vi.fn(), memberIds: vi.fn(), userRef: vi.fn() };

    await routeEnvelope(io, store, envelope(USER_DEACTIVATED_EVENT, {}));

    expect(inRoom).not.toHaveBeenCalled();
  });
});

describe('ChatEventsConsumer.runMaintenance', () => {
  function fakeRedis(overrides: Partial<Record<'xautoclaim' | 'xinfo' | 'xgroup', unknown>>) {
    return {
      xautoclaim: vi.fn(async () => ['0-0', [], []]),
      xinfo: vi.fn(async () => []),
      xgroup: vi.fn(async () => 0),
      xack: vi.fn(async () => 1),
      ...overrides,
    };
  }

  it('брошенная pending-запись перехватывается, маршрутизируется и ACK-ается', async () => {
    const { io, calls } = fakeIo();
    const store: MembershipStore = {
      isMember: vi.fn(),
      memberIds: vi.fn(async () => [USER_A]),
      userRef: vi.fn(),
    };
    const raw = JSON.stringify(envelope('chat.message_sent', { conversationId: CONV }));
    const redis = fakeRedis({
      xautoclaim: vi.fn(async () => ['0-0', [['1-0', ['envelope', raw]]], []]),
    });
    const consumer = new ChatEventsConsumer(redis as unknown as Redis, io, store, { group: 'g' });

    await consumer.runMaintenance();

    expect(redis.xautoclaim).toHaveBeenCalledWith(
      DOMAIN_EVENTS_STREAM,
      'g',
      `gateway-${process.pid}`,
      60_000,
      '0-0',
      'COUNT',
      100,
    );
    expect(calls.map((c) => c.room)).toEqual([`conv:${CONV}`, `user:${USER_A}`]);
    expect(redis.xack).toHaveBeenCalledWith(DOMAIN_EVENTS_STREAM, 'g', '1-0');
  });

  it('сбой обслуживания не пробрасывается (живое чтение не останавливается)', async () => {
    const { io } = fakeIo();
    const store: MembershipStore = { isMember: vi.fn(), memberIds: vi.fn(), userRef: vi.fn() };
    const redis = fakeRedis({
      xautoclaim: vi.fn(async () => {
        throw new Error('NOGROUP');
      }),
    });
    const consumer = new ChatEventsConsumer(redis as unknown as Redis, io, store, { group: 'g' });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(consumer.runMaintenance()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
