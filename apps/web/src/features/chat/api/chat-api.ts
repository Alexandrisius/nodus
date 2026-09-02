import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChatMessage, ConversationListItem, Paginated, TaskListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { api } from '../../../shared/api-client.js';
import { useAuthStore } from '../../../shared/auth-store.js';

export const chatKeys = {
  all: ['chat'] as const,
  conversations: () => [...chatKeys.all, 'conversations'] as const,
  messages: (id: string) => [...chatKeys.all, 'messages', id] as const,
};

export function useConversations() {
  return useQuery({
    queryKey: chatKeys.conversations(),
    queryFn: () => api<Paginated<ConversationListItem>>('/chat/conversations'),
  });
}

export function useConversationMessages(id: string) {
  return useQuery({
    queryKey: chatKeys.messages(id),
    queryFn: () => api<Paginated<ChatMessage>>(`/chat/conversations/${id}/messages`),
    enabled: id.length > 0,
  });
}

/** Поток Б: «В задачу» из сообщения чата. */
export function useMessageToTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (target: { conversationId: string; messageId: string }) =>
      api<TaskListItem>(
        `/chat/conversations/${target.conversationId}/messages/${target.messageId}/to-task`,
        { method: 'POST' },
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

/** Оптимистичная отправка сообщения (I4): мгновенно в кэш, откат при ошибке. */
export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: (text: string) =>
      api<ChatMessage>(`/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: { text },
      }),

    onMutate: async (text) => {
      await queryClient.cancelQueries({ queryKey: chatKeys.messages(conversationId) });
      const previous = queryClient.getQueryData<Paginated<ChatMessage>>(
        chatKeys.messages(conversationId),
      );
      const temp: ChatMessage = {
        id: `temp-${crypto.randomUUID()}`,
        conversationId,
        author: { id: user?.id ?? '', displayName: user?.displayName ?? '', avatarUrl: null },
        text,
        replyToId: null,
        threadRootId: null,
        threadRepliesCount: 0,
        reactions: [],
        attachments: [],
        editedAt: null,
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData<Paginated<ChatMessage>>(
        chatKeys.messages(conversationId),
        (old) => ({
          items: [...(old?.items ?? []), temp],
          nextCursor: old?.nextCursor ?? null,
        }),
      );
      return { previous, tempId: temp.id };
    },

    onError: (_error, _text, context) => {
      if (context?.previous) {
        queryClient.setQueryData(chatKeys.messages(conversationId), context.previous);
      }
      toast.error(ui.common.sendError);
    },

    onSuccess: (server, _text, context) => {
      queryClient.setQueryData<Paginated<ChatMessage>>(
        chatKeys.messages(conversationId),
        (old) => ({
          items: old?.items.map((m) => (m.id === context?.tempId ? server : m)) ?? [],
          nextCursor: old?.nextCursor ?? null,
        }),
      );
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.messages(conversationId) });
      void queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
    },
  });
}
