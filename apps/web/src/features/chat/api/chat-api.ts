import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConversationListItem, ConversationUpdateBody, Paginated } from '@nodus/contracts';

import { api } from '../../../shared/api-client.js';
import { chatKeys } from '../../../shared/chat/api.js';

/** Список бесед мессенджера. Сообщения/треды и «В задачу» — в shared/chat
 *  (второй потребитель — вкладка «Чат» панели проекта, I6). */
export function useConversations() {
  return useQuery({
    queryKey: chatKeys.conversations(),
    queryFn: () => api<Paginated<ConversationListItem>>('/chat/conversations'),
  });
}

/** Состояние беседы из контекстного меню (ПКМ, реф Битрикс24): закрепить /
 *  звук / «посмотреть позже» / скрыть. Оптимистично не работаем: список
 *  дешёвый, инвалидация мгновенная (I4 держим серверным ответом < 100 мс). */
export function useUpdateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ConversationUpdateBody }) =>
      api<ConversationListItem>(`/chat/conversations/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
    },
  });
}
