import { REALTIME_EVENTS } from '@nodus/contracts';

import { getChatSocket } from './socket-client.js';
import { typingKey } from './typing-store.js';

/**
 * «Печатает…» от композера (#104): клиентский троттл 2 с (серверный — 3 с);
 * событие эфемерное, в БД не попадает. Работает только в подключённой беседе
 * (gateway игнорирует не-присоединённые). threadRootId (раунд 3) — печать в
 * трэде: индикатор увидит шапка окна треда, список бесед — нет.
 */
const EMIT_THROTTLE_MS = 2_000;
const lastEmitAt = new Map<string, number>();

export function emitTyping(conversationId: string, threadRootId?: string | null): void {
  const socket = getChatSocket();
  if (!socket?.connected) {
    return;
  }
  const key = typingKey(conversationId, threadRootId);
  const now = Date.now();
  const last = lastEmitAt.get(key) ?? 0;
  if (now - last < EMIT_THROTTLE_MS) {
    return;
  }
  lastEmitAt.set(key, now);
  socket.emit(REALTIME_EVENTS.TYPING, {
    conversationId,
    ...(threadRootId ? { threadRootId } : {}),
  });
}
