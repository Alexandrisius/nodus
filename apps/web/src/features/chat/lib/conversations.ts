import type { ConversationListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { plural } from '../../../shared/lib/format.js';

/** Заголовок беседы: у канала/группы — название, у чата задачи — «№ · тема»,
 *  у личного — имя собеседника. */
export function conversationTitle(conversation: ConversationListItem): string {
  if (conversation.type === 'task' && conversation.task) {
    return `№ ${conversation.task.number} · ${conversation.task.title}`;
  }
  return conversation.title ?? conversation.membersPreview[0]?.displayName ?? '';
}

/** Единый список бесед по активности (вердикт владельца 2026-09-10, раунд 2):
 *  БЕЗ секций-заголовков — типы перемешаны, свежие сверху; беседы без
 *  сообщений — в конце (стабильно, в исходном порядке). */
export function sortByActivity(conversations: ConversationListItem[]): ConversationListItem[] {
  return [...conversations].sort((a, b) => {
    const ta = a.lastMessage?.createdAt ?? null;
    const tb = b.lastMessage?.createdAt ?? null;
    if (ta === null && tb === null) return 0;
    if (ta === null) return 1;
    if (tb === null) return -1;
    return tb.localeCompare(ta);
  });
}

/** Подзаголовок активной беседы: тип + участники (русская деловая форма). */
export function conversationSubtitle(conversation: ConversationListItem): string {
  if (conversation.type === 'project_channel') {
    return conversation.project
      ? `${ui.chat.channelOfProject} · ${conversation.project.name}`
      : ui.chat.channel;
  }
  if (conversation.type === 'task') {
    return conversation.task
      ? `${ui.chat.taskChat} · № ${conversation.task.number}`
      : ui.chat.taskChat;
  }
  const members = conversation.membersPreview.length;
  if (conversation.type === 'group') {
    return `${ui.chat.groupChat} · ${members} ${plural(members, [
      ui.chat.membersCountOne,
      ui.chat.membersCountFew,
      ui.chat.membersCountMany,
    ])}`;
  }
  return ui.common.online;
}
