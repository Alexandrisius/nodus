import type { MessagePin, Paginated } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { api } from '../api-client.js';
import { useAuthStore } from '../auth-store.js';
import { chatKeys } from './chat-keys.js';
import { findCached, mapMessage, restoreSnapshot, snapshotMessages } from './message-cache.js';

export function usePins(conversationId: string) {
  return useQuery({
    queryKey: chatKeys.pins(conversationId),
    queryFn: () => api<Paginated<MessagePin>>(`/chat/conversations/${conversationId}/pins`),
    select: (data) => data.items,
    enabled: conversationId.length > 0,
  });
}

/** Закреп/открепление (A3): оптимистично в пин-кэше и в ленте (флаг pinned).
 *  Открепление — с undo-тостом (случайный клик по × не теряет закреп). */
export function usePinToggle(conversationId: string) {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);

  const pin = useMutation({
    mutationFn: (messageId: string) =>
      api<MessagePin>(`/chat/conversations/${conversationId}/messages/${messageId}/pin`, {
        method: 'POST',
      }),

    onMutate: async (messageId) => {
      await qc.cancelQueries({ queryKey: chatKeys.pins(conversationId) });
      const pinsSnapshot = qc.getQueryData(chatKeys.pins(conversationId));
      const messagesSnapshot = snapshotMessages(qc, conversationId);
      const cached = findCached(qc, conversationId, messageId);
      if (cached && me) {
        const optimistic: MessagePin = {
          message: { ...cached, pinned: true },
          // AuthUser без avatarUrl (контракт) — PersonAvatar рисует инициалы.
          pinnedBy: { id: me.id, displayName: me.displayName, avatarUrl: null },
          pinnedAt: new Date().toISOString(),
        };
        qc.setQueryData<Paginated<MessagePin>>(chatKeys.pins(conversationId), (old) => ({
          items: [optimistic, ...(old?.items ?? [])],
          nextCursor: old?.nextCursor ?? null,
        }));
      }
      mapMessage(qc, conversationId, messageId, (m) => ({ ...m, pinned: true }));
      return { pinsSnapshot, messagesSnapshot };
    },

    onError: (_error, _vars, context) => {
      if (context) {
        qc.setQueryData(chatKeys.pins(conversationId), context.pinsSnapshot);
        restoreSnapshot(qc, context.messagesSnapshot);
      }
      toast.error(ui.common.saveError);
    },

    onSettled: () => {
      void qc.invalidateQueries({ queryKey: chatKeys.pins(conversationId) });
      void qc.invalidateQueries({ queryKey: chatKeys.messages(conversationId) });
    },
  });

  const unpin = useMutation({
    mutationFn: (messageId: string) =>
      api<void>(`/chat/conversations/${conversationId}/messages/${messageId}/pin`, {
        method: 'DELETE',
      }),

    onMutate: async (messageId) => {
      await qc.cancelQueries({ queryKey: chatKeys.pins(conversationId) });
      const pinsSnapshot = qc.getQueryData(chatKeys.pins(conversationId));
      const messagesSnapshot = snapshotMessages(qc, conversationId);
      qc.setQueryData<Paginated<MessagePin>>(chatKeys.pins(conversationId), (old) =>
        old ? { ...old, items: old.items.filter((p) => p.message.id !== messageId) } : old,
      );
      mapMessage(qc, conversationId, messageId, (m) => ({ ...m, pinned: false }));
      return { pinsSnapshot, messagesSnapshot };
    },

    onError: (_error, _vars, context) => {
      if (context) {
        qc.setQueryData(chatKeys.pins(conversationId), context.pinsSnapshot);
        restoreSnapshot(qc, context.messagesSnapshot);
      }
      toast.error(ui.common.saveError);
    },

    // Без тоста: открепление идёт через диалог подтверждения (вердикт
    // 24.09) — он и есть страховка от случайного клика.
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: chatKeys.pins(conversationId) });
      void qc.invalidateQueries({ queryKey: chatKeys.messages(conversationId) });
    },
  });

  return { pin, unpin };
}
