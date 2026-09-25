import type { Socket } from 'socket.io';
import { REALTIME_EVENTS, chatTypingEmitSchema } from '@nodus/contracts';

import { convRoom, socketConvRooms } from './rooms.ts';

/** Троттл на пользователя-беседу: чаще ~3 с не рассылаем (спека #104). */
const TYPING_THROTTLE_MS = 3_000;

/**
 * «Печатает…»: клиент → `chat.typing {conversationId}`; gateway пропускает
 * событие не чаще раза в THROTTLE_MS и рассылает в комнату беседы (кроме
 * сокетов автора). Эфемерно: не доменное событие, в БД/стрим не попадает.
 */
export class TypingThrottler {
  private readonly lastSentAt = new Map<string, number>();

  /** Обработать событие сокета; true — прошло троттл и ушло в комнату. */
  handle(socket: Socket, payload: unknown, now: Date = new Date()): boolean {
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
    socket.to(room).emit(REALTIME_EVENTS.TYPING, {
      conversationId: parsed.data.conversationId,
      userId,
    });
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
