import { SignJWT } from 'jose';
import { io as clientIo, type Socket as ClientSocket } from 'socket.io-client';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CHAT_EVENTS_STREAM, type RealtimeEnvelope } from '@nodus/contracts';

import { createGatewayServer, type GatewayServer } from '../../src/gateway-server.js';
import { PgMembershipStore } from '../../src/membership.js';
import { ensureGatewayTestDatabase, type GatewayTestDb } from './test-db.js';

/**
 * Сквозной контур gateway на живых PG/Redis: auth-хендшейк, комнаты с
 * проверкой членства, fanout из Redis Stream в комнаты (<1 с), typing,
 * presence. api-сторона здесь заменена прямым XADD contract-ного envelope —
 * публикацию из api покрывает apps/api/test/integration/chat-realtime-fanout.
 */
describe.skipIf(!process.env.DATABASE_URL || !process.env.REDIS_URL || !process.env.JWT_SECRET)(
  'gateway: сквозной контур (integration)',
  () => {
    let testDb: GatewayTestDb;
    let gateway: GatewayServer;
    let redis: Redis;
    /** Отдельное соединение для XADD из теста: Redis не читает сокет клиента,
     *  заблокированного XREADGROUP BLOCK — публикация по тому же соединению
     *  ждала бы окончания BLOCK (в проде издатель — другой процесс). */
    let publisherRedis: Redis;
    let store: PgMembershipStore;
    let baseUrl: string;
    const consumerGroup = `nodus:gateway-it-${crypto.randomUUID().slice(0, 8)}`;
    const streamEntryIds: string[] = [];
    const sockets: ClientSocket[] = [];

    beforeAll(async () => {
      testDb = await ensureGatewayTestDatabase(process.env.DATABASE_URL!);
      redis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
      publisherRedis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
      store = new PgMembershipStore(testDb.url);
      gateway = createGatewayServer({
        jwtSecret: process.env.JWT_SECRET!,
        store,
        redis,
        consumerGroup,
      });
      await new Promise<void>((resolve) => {
        gateway.httpServer.listen(0, '127.0.0.1', () => {
          resolve();
        });
      });
      const port = (gateway.httpServer.address() as { port: number }).port;
      baseUrl = `http://127.0.0.1:${port}`;
      await gateway.startFanout();
    }, 60_000);

    afterAll(async () => {
      for (const socket of sockets) {
        socket.disconnect();
      }
      // Свои записи стрима и изолированная группа прогона — ДО disconnect
      // (ioredis после disconnect отвергает команды).
      for (const entryId of streamEntryIds) {
        await publisherRedis?.xdel(CHAT_EVENTS_STREAM, entryId);
      }
      await publisherRedis
        ?.xgroup('DESTROY', CHAT_EVENTS_STREAM, consumerGroup)
        .catch(() => undefined);
      await gateway?.close();
      redis?.disconnect();
      publisherRedis?.disconnect();
      await store?.close();
      await testDb?.cleanup();
    }, 60_000);

    function token(userId: string): Promise<string> {
      return new SignJWT({ sid: 'it' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(userId)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
    }

    async function connect(userId: string): Promise<ClientSocket> {
      const socket = clientIo(baseUrl, {
        auth: { token: await token(userId) },
        transports: ['websocket'],
        reconnection: false,
        forceNew: true, // каждое соединение — свой Manager (как отдельная вкладка)
      });
      sockets.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
      return socket;
    }

    /**
     * Соединение с ожиданием presence-снимка. Слушатель регистрируется ДО
     * коннекта: при тёплом кэше профилей gateway эмитит snapshot в том же
     * сетевом батче, что и CONNECT, — слушатель, навешенный после await
     * connect, получает пакет слишком поздно (канон реального клиента:
     * обработчики вешаются при создании сокета).
     */
    async function connectWithSnapshot(
      userId: string,
    ): Promise<{
      socket: ClientSocket;
      snapshot: { entries: { user: { id: string }; status: string }[] };
    }> {
      const socket = clientIo(baseUrl, {
        auth: { token: await token(userId) },
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
      });
      sockets.push(socket);
      const snapshot = new Promise<{ entries: { user: { id: string }; status: string }[] }>(
        (resolve) => {
          socket.once('presence.snapshot', resolve);
        },
      );
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
      return { socket, snapshot: await snapshot };
    }

    function joinAck(socket: ClientSocket, conversationId: string): Promise<unknown> {
      return new Promise((resolve) => {
        socket.emit('conv:join', { conversationId }, resolve);
      });
    }

    it('хендшейк: невалидный токен отклонён, валидный подключается', async () => {
      const bad = clientIo(baseUrl, {
        auth: { token: 'garbage' },
        transports: ['websocket'],
        reconnection: false,
      });
      await new Promise<void>((resolve) => {
        bad.once('connect_error', () => {
          resolve();
        });
      });
      bad.disconnect();

      const socket = await connect(testDb.users[0]!.id);
      expect(socket.connected).toBe(true);
    });

    it('conv:join: член — ok, не-член — forbidden', async () => {
      const member = await connect(testDb.users[0]!.id);
      const outsider = await connect(testDb.users[2]!.id);

      await expect(joinAck(member, testDb.conversationId)).resolves.toEqual({ ok: true });
      await expect(joinAck(outsider, testDb.conversationId)).resolves.toEqual({
        ok: false,
        error: 'forbidden',
      });
    });

    it('fanout: envelope из стрима доставляется в комнату беседы <1 с', async () => {
      const receiver = await connect(testDb.users[1]!.id);
      await joinAck(receiver, testDb.conversationId);

      const received = new Promise<RealtimeEnvelope>((resolve) => {
        receiver.once('chat.message_sent', resolve);
      });

      const envelope: RealtimeEnvelope = {
        type: 'chat.message_sent',
        payload: {
          conversationId: testDb.conversationId,
          messageId: crypto.randomUUID(),
          seq: 1,
          authorId: testDb.users[0]!.id,
          threadRootId: null,
          forwarded: false,
        },
        seq: Date.now(),
        ts: new Date().toISOString(),
      };
      const sentAt = Date.now();
      // Стрим общий с dev-контуром: синтетика полностью контрактна и вычищается.
      const entryId = (await publisherRedis.xadd(
        CHAT_EVENTS_STREAM,
        'MAXLEN',
        '~',
        100_000,
        '*',
        'envelope',
        JSON.stringify(envelope),
      )) as string;
      streamEntryIds.push(entryId);

      const got = await received;
      expect(got.payload).toEqual(envelope.payload);
      expect(Date.now() - sentAt).toBeLessThan(1_000); // критерий #104 (цель p95 <200 мс)
    });

    it('typing: событие одного члена видно другому, но не самому автору', async () => {
      const alice = await connect(testDb.users[0]!.id);
      const bob = await connect(testDb.users[1]!.id);
      await joinAck(alice, testDb.conversationId);
      await joinAck(bob, testDb.conversationId);

      const bobSees = new Promise<unknown>((resolve) => {
        bob.once('chat.typing', resolve);
      });
      const aliceSelf = new Promise<void>((resolve, reject) => {
        alice.once('chat.typing', () => {
          reject(new Error('свой typing не должен возвращаться автору'));
        });
        setTimeout(resolve, 300);
      });

      alice.emit('chat.typing', { conversationId: testDb.conversationId });

      const payload = (await bobSees) as { conversationId: string; userId: string };
      expect(payload.conversationId).toBe(testDb.conversationId);
      expect(payload.userId).toBe(testDb.users[0]!.id);
      await aliceSelf;
    });

    it('presence: snapshot при подключении, offline при разрыве последнего', async () => {
      // Изоляция: сокеты предыдущих тестов держат тех же пользователей онлайн
      // (u0 из typing-теста) — offline у тестируемого сокета не наступил бы.
      for (const socket of sockets.splice(0)) {
        socket.disconnect();
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 200);
      });

      const first = await connectWithSnapshot(testDb.users[0]!.id);
      expect(first.snapshot.entries.some((e) => e.user.id === testDb.users[0]!.id)).toBe(true);

      const second = await connectWithSnapshot(testDb.users[1]!.id);
      expect(second.snapshot.entries.map((e) => e.user.id)).toContain(testDb.users[0]!.id);

      const offline = new Promise<unknown>((resolve) => {
        second.socket.once('presence.updated', resolve);
      });
      first.socket.disconnect();
      const update = (await offline) as { user: { id: string }; status: string };
      expect(update.user.id).toBe(testDb.users[0]!.id);
      expect(update.status).toBe('offline');
    });
  },
);
