import { Permission } from '@nodus/contracts';

import { useAuthStore } from '../auth-store.js';
import { useConversations } from './api.js';

/**
 * #245: видимость модераторского «Удалить» на ЧУЖИХ сообщениях — админ/
 * владелец беседы или глобальное право chat.moderate (модератор портала),
 * только группы и каналы. Серверная истина — та же политика в
 * MessagesService.deleteInternal (I8); хук отвечает лишь за меню UI.
 */
export function useCanModerateMessages(conversationId: string): boolean {
  const permissions = useAuthStore((s) => s.user?.permissions);
  const conversations = useConversations();
  const conversation = conversations.data?.items.find((item) => item.id === conversationId);
  if (!conversation) return false;
  if (conversation.type !== 'group' && conversation.type !== 'project_channel') return false;
  if (conversation.myRole === 'admin' || conversation.myRole === 'owner') return true;
  return (permissions ?? []).includes(Permission.CHAT_MODERATE);
}
