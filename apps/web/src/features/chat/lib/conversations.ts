import type { ConversationListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { plural } from '../../../shared/lib/format.js';

/** Заголовок беседы: у канала/группы — название, у личного — имя собеседника. */
export function conversationTitle(conversation: ConversationListItem): string {
  return conversation.title ?? conversation.membersPreview[0]?.displayName ?? '';
}

/** Секции списка бесед (каналы → групповые → личные). */
export const conversationSections = [
  { key: 'project_channel', label: ui.chat.channels },
  { key: 'group', label: ui.chat.groupChats },
  { key: 'direct', label: ui.chat.direct },
] as const;

/** Подзаголовок активной беседы: тип + участники (русская деловая форма). */
export function conversationSubtitle(conversation: ConversationListItem): string {
  if (conversation.type === 'project_channel') {
    return conversation.project
      ? `${ui.chat.channelOfProject} · ${conversation.project.name}`
      : ui.chat.channelOfProject;
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
