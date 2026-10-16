import type { ChatMessage, MessageReaction, UserRef } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { api } from '../api-client.js';
import { useAuthStore } from '../auth-store.js';
import { chatKeys } from './chat-keys.js';
import { mapMessage, restoreSnapshot, snapshotMessages } from './message-cache.js';

/** Оптимистичный прогноз массива реакций (#124): remove своей — уход из users
 *  и исчезновение чипа на нуле; add — вход в users или новый чип с mine:true
 *  (инвариант контракта: count === users.length). Повторный клик по своей —
 *  no-op (прогноз ничего не меняет). */
export function predictReactions(
  message: ChatMessage,
  emoji: string,
  remove: boolean,
  me: UserRef | null,
): MessageReaction[] {
  const existing = message.reactions.find((reaction) => reaction.emoji === emoji);
  // users может отсутствовать в кэше от api без поля (main) — не падаем.
  const usersOf = (reaction: MessageReaction) => reaction.users ?? [];
  if (remove) {
    return message.reactions
      .map((reaction) =>
        reaction.emoji === emoji
          ? {
              ...reaction,
              users: me ? usersOf(reaction).filter((user) => user.id !== me.id) : usersOf(reaction),
              mine: false,
            }
          : reaction,
      )
      .map((reaction) => ({ ...reaction, count: usersOf(reaction).length }))
      .filter((reaction) => reaction.count > 0);
  }
  if (existing) {
    if (existing.mine) return message.reactions;
    return message.reactions.map((reaction) =>
      reaction.emoji === emoji
        ? {
            ...reaction,
            users: me ? [...usersOf(reaction), me] : usersOf(reaction),
            count: usersOf(reaction).length + (me ? 1 : 0),
            mine: true,
          }
        : reaction,
    );
  }
  return [...message.reactions, { emoji, count: me ? 1 : 0, mine: true, users: me ? [me] : [] }];
}

/** Реакции (#124): toggle своей реакции — ховер-попап и клик по чипу.
 *  Оптимистичность по канону файла; серверный DTO — истина (onSuccess). */
export function useReactionToggle(conversationId: string) {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  // AuthUser без avatarUrl (контракт) — PersonAvatar рисует инициалы.
  const meRef: UserRef | null = me
    ? { id: me.id, displayName: me.displayName, avatarUrl: null }
    : null;
  return useMutation({
    mutationFn: (vars: { messageId: string; emoji: string; remove: boolean }) =>
      api<ChatMessage>(
        `/chat/conversations/${conversationId}/messages/${vars.messageId}/reactions`,
        { method: 'POST', body: { emoji: vars.emoji, remove: vars.remove } },
      ),

    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: chatKeys.messages(conversationId) });
      const snapshot = snapshotMessages(qc, conversationId);
      mapMessage(qc, conversationId, vars.messageId, (m) => ({
        ...m,
        reactions: predictReactions(m, vars.emoji, vars.remove, meRef),
      }));
      return { snapshot };
    },

    onError: (_error, _vars, context) => {
      if (context) restoreSnapshot(qc, context.snapshot);
      toast.error(ui.common.saveError);
    },

    onSuccess: (server, vars) => {
      mapMessage(qc, conversationId, vars.messageId, () => server);
    },

    // Реакций нет в списке бесед — инвалидируется только messages-префикс
    // (окно треда покрыто префиксом).
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: chatKeys.messages(conversationId) });
    },
  });
}
