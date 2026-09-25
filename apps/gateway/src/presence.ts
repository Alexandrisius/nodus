import type { Server, Socket } from 'socket.io';
import { REALTIME_EVENTS, type PresenceEntry, type UserRef } from '@nodus/contracts';

import type { MembershipStore } from './membership.ts';
import { PRESENCE_ROOM } from './rooms.ts';

/**
 * Presence: онлайн = есть живые соединения пользователя; offline — разрыв
 * последнего. Канон: эфемерно, в БД не хранится (спека #104). Состояния
 * online/offline (away — задел контракта, не эмитится).
 */
export class PresenceTracker {
  private readonly connections = new Map<string, Set<string>>();
  private readonly store: MembershipStore;
  private readonly io: Server;

  constructor(store: MembershipStore, io: Server) {
    this.store = store;
    this.io = io;
  }

  /** Подключение аутентифицированного сокета: user-комната, snapshot, broadcast. */
  async connect(socket: Socket): Promise<void> {
    const userId = socket.data.userId as string;
    let sockets = this.connections.get(userId);
    if (!sockets) {
      sockets = new Set<string>();
      this.connections.set(userId, sockets);
    }
    const wasOffline = sockets.size === 0;
    sockets.add(socket.id);
    await socket.join(PRESENCE_ROOM);
    const ref = await this.store.userRef(userId);
    if (!ref) {
      return; // профиль недоступен — presence для пользователя не рассылаем
    }
    socket.emit(REALTIME_EVENTS.PRESENCE_SNAPSHOT, { entries: await this.snapshot() });
    if (wasOffline) {
      this.io.to(PRESENCE_ROOM).emit(REALTIME_EVENTS.PRESENCE_UPDATED, entry(ref, 'online'));
    }
  }

  /** Разрыв сокета; при уходе последнего — broadcast offline. */
  disconnect(socket: Socket): void {
    const userId = socket.data.userId as string;
    const sockets = this.connections.get(userId);
    if (!sockets || !sockets.delete(socket.id) || sockets.size > 0) {
      return;
    }
    this.connections.delete(userId);
    void this.store
      .userRef(userId)
      .then((ref) => {
        if (ref) {
          this.io.to(PRESENCE_ROOM).emit(REALTIME_EVENTS.PRESENCE_UPDATED, entry(ref, 'offline'));
        }
      })
      .catch(() => undefined);
  }

  private async snapshot(): Promise<PresenceEntry[]> {
    const entries: PresenceEntry[] = [];
    for (const userId of this.connections.keys()) {
      const ref = await this.store.userRef(userId);
      if (ref) {
        entries.push(entry(ref, 'online'));
      }
    }
    return entries;
  }
}

function entry(user: UserRef, status: 'online' | 'offline'): PresenceEntry {
  return { user, status };
}
