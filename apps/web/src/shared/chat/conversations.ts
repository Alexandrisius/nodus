import type { ConversationListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { plural } from '../lib/format.js';

/**
 * Заголовки/сортировка бесед — shared-слой (#87: диалог пересылки в
 * shared/chat нуждается в тех же хелперах; features/chat/lib/conversations.ts
 * реэкспортирует отсюда, потребители не меняются).
 */

/** Диалог с самим собой — «Заметки» (модель Битрикс24, вердикт владельца
 *  13.09.2026): единственный участник = текущий пользователь. */
export function isNotesConversation(
  conversation: ConversationListItem,
  meId: string | null | undefined,
): boolean {
  return (
    conversation.type === 'direct' &&
    conversation.membersPreview.length === 1 &&
    conversation.membersPreview[0]?.id === meId
  );
}

/** Заголовок беседы: у канала/группы — название, у чата задачи — «№ · тема»,
 *  у чата письма — «рег.№ · тема» (без номера — тема), у личного — имя
 *  собеседника, у диалога с собой — «Заметки». */
export function conversationTitle(
  conversation: ConversationListItem,
  meId?: string | null,
): string {
  if (conversation.type === 'task' && conversation.task) {
    return `№ ${conversation.task.number} · ${conversation.task.title}`;
  }
  if (conversation.type === 'letter' && conversation.letter) {
    const ref = conversation.letter.regNumber;
    return ref ? `${ref} · ${conversation.letter.subject}` : conversation.letter.subject;
  }
  if (isNotesConversation(conversation, meId)) return ui.chat.notes;
  return conversation.title ?? conversation.membersPreview[0]?.displayName ?? '';
}

/** Единый список бесед по активности (вердикт владельца 2026-09-10, раунд 2):
 *  БЕЗ секций-заголовков — типы перемешаны, свежие сверху; закреплённые
 *  (ПКМ-меню, реф Битрикс24) — ВСЕГДА сверху, между собой по активности;
 *  беседы без сообщений — в конце (стабильно, в исходном порядке).
 *  Черновики (#91, реф Telegram/Bitrix24): беседа с черновиком поднимается
 *  СРАЗУ за закреплёнными (закреп выше черновика — канон обоих мессенджеров);
 *  hasDraft — клиентские черновики, серверный draft листа догоняет меткой. */
export function sortByActivity(
  conversations: ConversationListItem[],
  hasDraft?: (conversationId: string) => boolean,
): ConversationListItem[] {
  const rank = (c: ConversationListItem) => (c.pinned ? 0 : (hasDraft?.(c.id) ?? false) ? 1 : 2);
  return [...conversations].sort((a, b) => {
    const tier = rank(a) - rank(b);
    if (tier !== 0) return tier;
    const ta = a.lastMessage?.createdAt ?? null;
    const tb = b.lastMessage?.createdAt ?? null;
    if (ta === null && tb === null) return 0;
    if (ta === null) return 1;
    if (tb === null) return -1;
    return tb.localeCompare(ta);
  });
}

/** Подзаголовок активной беседы: тип + участники (русская деловая форма).
 *  Название ПРОЕКТА и номер задачи НЕ повторяем: они уже в заголовке строки
 *  (вердикт владельца 15.09.2026: «дублирование названий проекта в чатах»). */
export function conversationSubtitle(conversation: ConversationListItem): string {
  if (conversation.type === 'project_channel') {
    return ui.chat.channelOfProject;
  }
  if (conversation.type === 'task') {
    return ui.chat.taskChat;
  }
  if (conversation.type === 'letter') {
    return ui.chat.letterChat;
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
