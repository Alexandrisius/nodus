import type { Socket } from 'socket.io';
import type { MembershipStore } from './membership.ts';

/** Комнаты: `conv:{conversationId}` — только члены беседы; `user:{userId}` — персональная. */
export function convRoom(conversationId: string): string {
  return `conv:${conversationId}`;
}

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

/** Общая комната presence-обновлений (все аутентифицированные сокеты). */
export const PRESENCE_ROOM = 'presence';

/** Потолок бесед на сокет: страница мессенджера + карточки с чатами. */
export const MAX_ROOMS_PER_SOCKET = 50;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface JoinAck {
  ok: boolean;
  error?: 'bad_request' | 'forbidden' | 'room_limit' | 'unavailable';
}

/** Комнаты, присоединённые сокетом через conv:join (typing без похода в БД). */
export function socketConvRooms(socket: Socket): Set<string> {
  const data = socket.data as { convRooms?: Set<string> };
  if (!data.convRooms) {
    data.convRooms = new Set<string>();
  }
  return data.convRooms;
}

/**
 * Протокол подписки: клиент шлёт `conv:join {conversationId}` при открытии
 * беседы и `conv:leave` при уходе. Членство проверяется в Postgres (READ-ONLY);
 * не-члену отказ (не раскрываем существование беседы), успех подтверждается ack.
 */
export function registerRoomHandlers(socket: Socket, store: MembershipStore): void {
  socket.on('conv:join', async (payload: unknown, ack?: (result: JoinAck) => void) => {
    const conversationId = readConversationId(payload);
    if (!conversationId) {
      ack?.({ ok: false, error: 'bad_request' });
      return;
    }
    const room = convRoom(conversationId);
    const rooms = socketConvRooms(socket);
    if (rooms.has(room)) {
      ack?.({ ok: true });
      return;
    }
    if (rooms.size >= MAX_ROOMS_PER_SOCKET) {
      ack?.({ ok: false, error: 'room_limit' });
      return;
    }
    try {
      const member = await store.isMember(socket.data.userId as string, conversationId);
      if (!member) {
        ack?.({ ok: false, error: 'forbidden' });
        return;
      }
      await socket.join(room);
      rooms.add(room);
      ack?.({ ok: true });
    } catch {
      ack?.({ ok: false, error: 'unavailable' });
    }
  });

  socket.on('conv:leave', (payload: unknown) => {
    const conversationId = readConversationId(payload);
    if (!conversationId) {
      return;
    }
    const room = convRoom(conversationId);
    socketConvRooms(socket).delete(room);
    void socket.leave(room);
  });
}

function readConversationId(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const value = (payload as { conversationId?: unknown }).conversationId;
  return typeof value === 'string' && UUID_RE.test(value) ? value : null;
}
