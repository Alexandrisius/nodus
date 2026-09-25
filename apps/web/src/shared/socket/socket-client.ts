import type { QueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { REALTIME_EVENTS, realtimeEnvelopeSchema, type RealtimeEnvelope } from '@nodus/contracts';

import { isDomainMocked } from '../api/api-mock-config.js';
import { useAuthStore } from '../auth-store.js';
import { chatKeys } from '../chat/api.js';
import { usePresenceStore } from './presence-store.js';
import { applyRealtimeInvalidation } from './socket-invalidation.js';
import { useSocketStatusStore } from './socket-status-store.js';
import { useTypingStore } from './typing-store.js';

/**
 * Единственное WS-соединение приложения (#104): подключается после логина,
 * пока домен chat живой (мок-режим чата — без сокета, там нет живых данных).
 * Обработчики регистрируются ДО коннекта: первый батч пакетов (presence-
 * snapshot) приезжает вместе с CONNECT и диспатчится немедленно.
 * Состояние сокета тихое (без UI-индикаторов).
 */

const DOMAIN_EVENTS = [
  'chat.message_sent',
  'chat.message_edited',
  'chat.message_deleted',
  'chat.message_read',
  'chat.message_pinned',
  'chat.message_unpinned',
  'chat.reaction_added',
  'chat.reaction_removed',
  'chat.thread_created',
  'chat.conversation_created',
  'chat.member_added',
] as const;

let socket: Socket | null = null;

/** Беседы, подписанные этим клиентом (пере-join после reconnect). */
const joinedConversations = new Set<string>();

export function getChatSocket(): Socket | null {
  return socket;
}

export function connectChatSocket(queryClient: QueryClient): void {
  if (socket !== null || isDomainMocked('chat')) {
    return;
  }
  const client = io({
    // Тот же origin: vite dev / nginx прооксируют /socket.io на gateway.
    auth: (cb) => {
      cb({ token: useAuthStore.getState().accessToken });
    },
  });
  socket = client;
  const status = useSocketStatusStore.getState();
  const typing = useTypingStore.getState();
  const presence = usePresenceStore.getState();

  client.on('connect', () => {
    status.setConnected(true);
    // Reconnect: догон состояния (события разрыва пропущены — invalidate
    // всего чат-дерева ключей) + повторная подписка на активные беседы.
    void queryClient.invalidateQueries({ queryKey: chatKeys.all });
    for (const conversationId of joinedConversations) {
      emitJoin(conversationId);
    }
  });
  client.on('disconnect', () => {
    status.setConnected(false);
  });
  client.on('connect_error', (error: Error) => {
    if (error.message === 'unauthorized') {
      // Access-токен истёк: один прозрачный refresh — следующая попытка
      // реконнекта возьмёт свежий токен (function-auth).
      void useAuthStore.getState().tryRefresh();
    }
  });

  for (const event of DOMAIN_EVENTS) {
    client.on(event, (raw: unknown) => {
      const parsed = realtimeEnvelopeSchema.safeParse(raw);
      if (parsed.success) {
        applyRealtimeInvalidation(queryClient, parsed.data satisfies RealtimeEnvelope);
      }
    });
  }
  client.on(REALTIME_EVENTS.TYPING, (raw: unknown) => {
    const payload = raw as { conversationId?: unknown; userId?: unknown };
    if (typeof payload.conversationId === 'string' && typeof payload.userId === 'string') {
      typing.touch(payload.conversationId, payload.userId);
    }
  });
  client.on(REALTIME_EVENTS.PRESENCE_SNAPSHOT, (raw: unknown) => {
    const payload = raw as { entries?: { user: { id: string } }[] };
    if (Array.isArray(payload.entries)) {
      presence.applySnapshot(payload.entries.map((e) => e.user));
    }
  });
  client.on(REALTIME_EVENTS.PRESENCE_UPDATED, (raw: unknown) => {
    const payload = raw as { user?: { id?: unknown }; status?: unknown };
    if (typeof payload.user?.id === 'string' && typeof payload.status === 'string') {
      presence.setStatus(payload.user.id, payload.status as 'online' | 'away' | 'offline');
    }
  });
}

export function disconnectChatSocket(): void {
  if (socket === null) {
    return;
  }
  socket.disconnect();
  socket = null;
  joinedConversations.clear();
  useSocketStatusStore.getState().setConnected(false);
  useTypingStore.getState().reset();
  usePresenceStore.getState().reset();
}

/** Подписка на комнату беседы (членство проверяет gateway). */
export function joinConversation(conversationId: string): void {
  if (joinedConversations.has(conversationId)) {
    return;
  }
  joinedConversations.add(conversationId);
  emitJoin(conversationId);
}

export function leaveConversation(conversationId: string): void {
  joinedConversations.delete(conversationId);
  socket?.emit('conv:leave', { conversationId });
}

function emitJoin(conversationId: string): void {
  socket?.emit('conv:join', { conversationId }, (ack: { ok?: boolean } | null) => {
    if (!ack?.ok) {
      // Отказ (не член / лимит) — не держим в карте пере-join.
      joinedConversations.delete(conversationId);
    }
  });
}
