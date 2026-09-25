import type { Server, Socket } from 'socket.io';
import { REALTIME_EVENTS, chatTypingEmitSchema } from '@nodus/contracts';

import { convRoom, socketConvRooms, userRoom } from './rooms.ts';
import type { MembershipStore } from './membership.ts';

/** Троттл на пользователя-беседу: чаще ~3 с не рассылаем (спека #104). */
const TYPING_THROTTLE_MS = 3_000;

/**
 * «Печатает…» (#104 + раунд 2): клиент → `chat.typing {conversationId}`;
 * gateway пропускает событие не чаще раза в THROTTLE_MS и рассылает в комнату
 * беседы (кроме сокетов автора) ПЛЮС в user-комнаты остальных участников
 * (список бесед: Telegram-модель «печатает…» и в шапке, и в списке чатов;
 * SELECT members — тот же механизм, что у message_sent, раунд 2 #104).
 * Автора из user-комнат исключаем: свои вкладки свою печать не видят.
 * Эфемерно: не доменное событие, в БД/стрим не попадает.
 */
export class TypingThrottler {
  private readonly lastSentAt = new Map<string, number>();
  private readonly io: Server;
  private readonly store: MembershipStore;

  constructor(io: Server, store: MembershipStore) {
    this.io = io;
    this.store = store;
  }

  /** Обработать событие сокета; true — прошло троттл и разошлось. */
  async handle(socket: Socket, payload: unknown, now: Date = new Date()): Promise<boolean> {
    const userId = socket.data.userId;
    if (typeof userId !== 'string') {
      return false;
    }
    const parsed = chatTypingEmitSchema.safeParse(payload);
    if (!parsed.success) {
      return false;
    }
    const room = convRoom(parsed.data.conversationId);
    if (!socketConvRooms(socket).has(room)) {
      return false; // только в присоединённых беседах — членство уже проверено
    }
    const key = `${userId}:${parsed.data.conversationId}`;
    const last = this.lastSentAt.get(key) ?? 0;
    if (now.getTime() - last < TYPING_THROTTLE_MS) {
      return false;
    }
    this.lastSentAt.set(key, now.getTime());
    const event = {
      conversationId: parsed.data.conversationId,
      userId,
    };
    socket.to(room).emit(REALTIME_EVENTS.TYPING, event);
    // Список бесед остальных участников (не в комнате беседы): user-комнаты.
    // Ошибка PG здесь не должна ронять процесс (unhandledRejection): conv-
    // рассылка уже ушла, user-хвост догонит следующее событие после троттла.
    const members = await this.store.memberIds(parsed.data.conversationId).catch(() => null);
    if (members === null) return true;
    const targets = new Set(members.filter((member) => member !== userId).map(userRoom));
    if (targets.size > 0) {
      this.io.to([...targets]).emit(REALTIME_EVENTS.TYPING, event);
    }
    return true;
  }

  /** Чистка карты при disconnect пользователя (иначе карта растёт неограниченно). */
  forget(userId: string): void {
    const prefix = `${userId}:`;
    for (const key of this.lastSentAt.keys()) {
      if (key.startsWith(prefix)) {
        this.lastSentAt.delete(key);
      }
    }
  }
}
