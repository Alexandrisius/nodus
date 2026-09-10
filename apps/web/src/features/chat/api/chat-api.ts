import { useQuery } from '@tanstack/react-query';
import type { ConversationListItem, Paginated } from '@nodus/contracts';

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
