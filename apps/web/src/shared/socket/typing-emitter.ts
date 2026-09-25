import { REALTIME_EVENTS } from '@nodus/contracts';

import { getChatSocket } from './socket-client.js';

/**
 * «Печатает…» от композера (#104): клиентский троттл 2 с (серверный — 3 с);
 * событие эфемерное, в БД не попадает. Работает только в подключённой беседе
 * (gateway игнорирует не-присоединённые).
 */
const EMIT_THROTTLE_MS = 2_000;
const lastEmitAt = new Map<string, number>();

export function emitTyping(conversationId: string): void {
  const socket = getChatSocket();
  if (!socket?.connected) {
    return;
  }
  const now = Date.now();
  const last = lastEmitAt.get(conversationId) ?? 0;
  if (now - last < EMIT_THROTTLE_MS) {
    return;
  }
  lastEmitAt.set(conversationId, now);
  socket.emit(REALTIME_EVENTS.TYPING, { conversationId });
}
