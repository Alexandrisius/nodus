import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ConversationListItem,
  ConversationUpdateBody,
  CreateConversationBody,
} from '@nodus/contracts';

import { api } from '../../../shared/api-client.js';
import { chatKeys } from '../../../shared/chat/api.js';

/** Список бесед переехал в shared/chat/api.ts (#87: второй потребитель —
 *  диалог пересылки в shared-слое, I6); реэкспорт для импортов фичи. */
export { useConversations } from '../../../shared/chat/api.js';

/** Создание группового чата/канала (#91, окно создания реф Bitrix24):
 *  диалог шлёт название/участников/настройки/матрицу прав; новая беседа
 *  открывается сразу (хост выбирает её из onSuccess). */
export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateConversationBody) =>
      api<ConversationListItem>('/chat/conversations', { method: 'POST', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
    },
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
