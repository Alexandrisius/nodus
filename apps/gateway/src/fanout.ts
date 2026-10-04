import type { Server } from 'socket.io';
import type { Redis } from 'ioredis';
import {
  DOMAIN_EVENTS_STREAM,
  realtimeEnvelopeSchema,
  type RealtimeEnvelope,
} from '@nodus/contracts';

import type { MembershipStore } from './membership.ts';
import { convRoom, userRoom } from './rooms.ts';

/** Consumer group gateway в стриме событий чата. */
const CONSUMER_GROUP = 'nodus:gateway';
const CONSUMER_BATCH = 100;
const CONSUMER_BLOCK_MS = 5_000;
const RETRY_DELAY_MS = 1_000;

export interface ChatEventsConsumerOptions {
  /** Имя consumer group (по умолчанию nodus:gateway); тесты подставляют своё. */
  group?: string;
}

/** События, меняющие список бесед (lastMessage/unread/название/аватар) → дублируем в user-комнаты участников. */
const LIST_EVENTS = new Set([
  'chat.message_sent',
  'chat.message_edited',
  'chat.message_deleted',
  // #186: название/аватар видны в списке у всех участников.
  'chat.conversation_updated',
]);

function logError(scope: string, error: unknown): void {
  // TODO(core): структурное логирование (pino) — issue #2/#3.
  console.error(`[gateway] ${scope}:`, error);
}

/**
 * Маршрутизация envelope по комнатам (чистая функция для юнит-тестов):
 * - события беседы → `conv:{conversationId}` (только члены в комнате);
 * - message_sent/edited/deleted → плюс user-комнаты участников (список бесед);
 * - message_read → комната беседы (галочки автора) + user:{reader} (свои устройства);
 * - conversation_created/member_added → user-комнаты затронутых;
 * - notification.* (#100) → user-комната получателя (payload.userId или
 *   snapshot.userId); прочие типы — игнор (стрим несёт все доменные события,
 *   gateway расходует только адресованные ему).
 */
export async function routeEnvelope(
  io: Server,
  store: MembershipStore,
  envelope: RealtimeEnvelope,
): Promise<void> {
  const payload = (envelope.payload ?? {}) as Record<string, unknown>;

  if (envelope.type.startsWith('notification.')) {
    const snapshot = payload.snapshot as Record<string, unknown> | undefined;
    const target =
      (typeof payload.userId === 'string' && payload.userId) ||
      (typeof snapshot?.userId === 'string' ? snapshot.userId : null);
    if (target) {
      io.to(userRoom(target)).emit(envelope.type, envelope);
    }
    return;
  }

  const conversationId = typeof payload.conversationId === 'string' ? payload.conversationId : null;

  if (envelope.type === 'chat.conversation_created') {
    emitToUsers(io, envelope, memberIdsOf(payload.memberIds));
    return;
  }
  if (envelope.type === 'chat.member_added') {
    if (conversationId) {
      io.to(convRoom(conversationId)).emit(envelope.type, envelope);
    }
    emitToUsers(io, envelope, memberIdsOf(payload.userIds));
    return;
  }
  if (envelope.type === 'chat.member_removed') {
    // #186: исключённый (payload.userId) теряет беседу из списка — его
    // user-комната; остальные участники рефечат счётчик и панель в conv-комнате.
    if (conversationId) {
      io.to(convRoom(conversationId)).emit(envelope.type, envelope);
    }
    if (typeof payload.userId === 'string') {
      io.to(userRoom(payload.userId)).emit(envelope.type, envelope);
    }
    return;
  }
  if (envelope.type === 'chat.member_role_changed') {
    // #186: смена роли видна участникам беседы (панель участников).
    if (conversationId) {
      io.to(convRoom(conversationId)).emit(envelope.type, envelope);
    }
    if (typeof payload.userId === 'string') {
      io.to(userRoom(payload.userId)).emit(envelope.type, envelope);
    }
    return;
  }
  if (envelope.type === 'chat.message_read') {
    if (conversationId) {
      io.to(convRoom(conversationId)).emit(envelope.type, envelope);
    }
    if (typeof payload.userId === 'string') {
      io.to(userRoom(payload.userId)).emit(envelope.type, envelope);
    }
    return;
  }
  // Избранное (#171): личное состояние (как прочитанность) — только
  // user-комната владельца, участникам беседы не рассылается.
  if (
    envelope.type === 'chat.favorite_added' ||
    envelope.type === 'chat.favorite_removed' ||
    envelope.type === 'chat.favorite_updated'
  ) {
    if (typeof payload.userId === 'string') {
      io.to(userRoom(payload.userId)).emit(envelope.type, envelope);
    }
    return;
  }
  if (!conversationId) {
    return; // message_*/reaction/pin/thread_created без беседы — некуда маршрутизировать
  }
  io.to(convRoom(conversationId)).emit(envelope.type, envelope);
  if (LIST_EVENTS.has(envelope.type)) {
    emitToUsers(io, envelope, await store.memberIds(conversationId));
  }
}

/**
 * Консьюмер Redis Stream `nodus:chat:events`: consumer group читает только
 * новые записи (`$` на старте — историю в стриме не ретранслируем: клиенты
 * ресинхронизируются рефечем), каждая запись эмитится в комнаты и XACK-ается.
 * Порядок seq может нарушаться поздними коммитами в api — безопасно:
 * клиент применяет события только как сигнал к рефечу.
 */
export class ChatEventsConsumer {
  private readonly redis: Redis;
  private readonly io: Server;
  private readonly store: MembershipStore;
  private readonly group: string;
  private readonly consumerName: string;
  private running = false;

  constructor(
    redis: Redis,
    io: Server,
    store: MembershipStore,
    options: ChatEventsConsumerOptions = {},
  ) {
    this.redis = redis;
    this.io = io;
    this.store = store;
    this.group = options.group ?? CONSUMER_GROUP;
    this.consumerName = `gateway-${process.pid}`;
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    try {
      await this.redis.xgroup('CREATE', DOMAIN_EVENTS_STREAM, this.group, '$', 'MKSTREAM');
    } catch (error) {
      if (!String(error).includes('BUSYGROUP')) {
        throw error;
      }
    }
    this.running = true;
    void this.loop();
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        const result = (await this.redis.xreadgroup(
          'GROUP',
          this.group,
          this.consumerName,
          'COUNT',
          CONSUMER_BATCH,
          'BLOCK',
          CONSUMER_BLOCK_MS,
          'STREAMS',
          DOMAIN_EVENTS_STREAM,
          '>',
        )) as [string, [string, string[]][]][] | null;
        if (!result) {
          continue; // BLOCK истёк без записей
        }
        const entries = result[0]?.[1] ?? [];
        for (const [id, fields] of entries) {
          await this.processEntry(id, fields);
        }
      } catch (error) {
        if (!this.running) {
          return;
        }
        logError('stream consumer', error);
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  private async processEntry(id: string, fields: string[]): Promise<void> {
    try {
      const index = fields.indexOf('envelope');
      const raw = index >= 0 ? fields[index + 1] : undefined;
      if (raw) {
        const parsed = realtimeEnvelopeSchema.safeParse(JSON.parse(raw));
        if (parsed.success) {
          await routeEnvelope(this.io, this.store, parsed.data);
        } else {
          console.warn('[gateway] malformed envelope skipped, stream entry', id);
        }
      }
    } catch (error) {
      logError(`envelope ${id}`, error); // poison-запись: логируем и ack-аем, группу не блокируем
    } finally {
      await this.redis.xack(DOMAIN_EVENTS_STREAM, this.group, id);
    }
  }
}

function emitToUsers(io: Server, envelope: RealtimeEnvelope, userIds: string[]): void {
  for (const userId of userIds) {
    io.to(userRoom(userId)).emit(envelope.type, envelope);
  }
}

function memberIdsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
