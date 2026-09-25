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
});
