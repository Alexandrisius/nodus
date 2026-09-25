import { createServer, type Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import type { Redis } from 'ioredis';
import { REALTIME_EVENTS } from '@nodus/contracts';

import { createAccessTokenVerifier, type AccessTokenVerifier } from './auth.ts';
import { ChatEventsConsumer } from './fanout.ts';
import { buildHealthPayload } from './health-payload.ts';
import type { MembershipStore } from './membership.ts';
import { PresenceTracker } from './presence.ts';
import { registerRoomHandlers, userRoom } from './rooms.ts';
import { TypingThrottler } from './typing.ts';

export interface GatewayDeps {
  jwtSecret: string;
  store: MembershipStore;
  redis: Redis;
  /** Имя consumer group стрима (тесты подставляют изолированное). */
  consumerGroup?: string;
}

export interface GatewayServer {
  httpServer: HttpServer;
  io: Server;
  consumer: ChatEventsConsumer;
  /** Запуск консьюмера стрима (после listen). Идемпотентен. */
  startFanout(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Сборка WS-gateway (используется main.ts и интеграционными тестами):
 * HTTP только для /health; всё остальное — Socket.IO (auth-хендшейк →
 * user-комната + presence → обработчики комнат/typing → fanout стрима).
 */
export function createGatewayServer(deps: GatewayDeps): GatewayServer {
  const httpServer = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(buildHealthPayload()));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });

  const io = new Server(httpServer);
  const verify: AccessTokenVerifier = createAccessTokenVerifier(deps.jwtSecret);
  const typing = new TypingThrottler();
  const presence = new PresenceTracker(deps.store, io);

  io.use(async (socket, next) => {
    const identity = await verify(socket.handshake.auth?.token);
    if (!identity) {
      next(new Error('unauthorized')); // connect_error у клиента, сессии нет
      return;
    }
    socket.data.userId = identity.userId;
    next();
  });

  io.on('connection', (socket: Socket) => {
    // Обработчики регистрируются СИНХРОННО: клиент может прислать conv:join
    // раньше, чем завершится async-подготовка (user-комната, presence с
    // PG-запросом) — незарегистрированное событие теряется безвозвратно.
    registerRoomHandlers(socket, deps.store);
    socket.on(REALTIME_EVENTS.TYPING, (payload: unknown) => {
      typing.handle(socket, payload);
    });
    socket.on('disconnect', () => {
      presence.disconnect(socket);
      typing.forget(socket.data.userId as string);
    });
    void (async () => {
      await socket.join(userRoom(socket.data.userId as string));
      await presence.connect(socket);
    })().catch((error: unknown) => {
      console.error('[gateway] connection setup failed:', error);
      socket.disconnect(true);
    });
  });

  const consumer = new ChatEventsConsumer(deps.redis, io, deps.store, {
    group: deps.consumerGroup,
  });

  return {
    httpServer,
    io,
    consumer,
    startFanout() {
      return consumer.start();
    },
    async close() {
      await consumer.stop();
      io.close();
      await new Promise<void>((resolve) => {
        httpServer.close(() => {
          resolve();
        });
      });
    },
  };
}
