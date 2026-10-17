import { describe, expect, it, vi } from 'vitest';
import type { Server } from 'socket.io';
import type { Redis } from 'ioredis';
import { DOMAIN_EVENTS_STREAM, type RealtimeEnvelope } from '@nodus/contracts';

import { ChatEventsConsumer } from './fanout.js';
import type { MembershipStore } from './membership.js';

const CONV = '00000000-0000-4000-8000-0000000000c1';
const USER_A = '00000000-0000-4000-8000-0000000000a1';

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
