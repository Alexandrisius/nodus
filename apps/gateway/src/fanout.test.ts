import { describe, expect, it, vi } from 'vitest';
import type { Server } from 'socket.io';
import type { RealtimeEnvelope } from '@nodus/contracts';

import { routeEnvelope } from './fanout.js';
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

  it('member_removed (#186): комната беседы + user-комната исключённого', async () => {
    const { io, calls } = fakeIo();
    const store: MembershipStore = { isMember: vi.fn(), memberIds: vi.fn(), userRef: vi.fn() };
    await routeEnvelope(
      io,
      store,
      envelope('chat.member_removed', { conversationId: CONV, userId: USER_B, actorId: USER_A }),
    );
    expect(calls.map((c) => c.room)).toEqual([`conv:${CONV}`, `user:${USER_B}`]);
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

  it('неизвестный доменный тип (стрим общий) — игнор без ошибок', async () => {
    const { io, calls } = fakeIo();
    const store: MembershipStore = { isMember: vi.fn(), memberIds: vi.fn(), userRef: vi.fn() };
    await routeEnvelope(io, store, envelope('file.preview_ready', { fileId: 'f1' }));
    expect(calls).toHaveLength(0);
  });
});
