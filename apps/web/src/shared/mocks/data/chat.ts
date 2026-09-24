// I5-обоснование: мок-набор БЕСЕД чата (данные, не god-object) — одна
// ответственность «демо-беседы»; сообщения — chat-messages.ts, письма —
// chat-letters.ts, закрепы-демо — внизу файла.
import type { ChatMessage, ConversationListItem, MessagePin } from '@nodus/contracts';

import { letterMessages, rawLetterConversations } from './chat-letters.js';
import { channelMessages } from './chat-messages.js';
import { isoAgo } from './dates.js';
import { projectRefs, tid } from './tasks.js';
import { userIds, userRef } from './users.js';

// Реэкспорт cid для потребителей (projects.ts, letters.ts) — исторически
// импортируется отсюда; определение — в chat-ids.ts (против цикла импортов).
export { cid } from './chat-ids.js';
import { cid, mid } from './chat-ids.js';

/** Канал проекта создаётся АВТОМАТИЧЕСКИ при создании проекта (вердикт
 *  владельца 2026-09-10): канал есть у каждого проекта демо-набора.
 *  Чаты задач (type=task) — обсуждения конкретных задач для вкладки
 *  «Чаты задач» мессенджера (вердикт владельца 2026-09-10, раунд 2). */
/** Флаги состояния беседы (закреплена/звук/«посмотреть позже») добавляются
 *  map-ом: демо-литералы чистые, моки-обработчики ПКМ-меню правят флаги
 *  inplace (контекстное меню беседы, реф Битрикс24, вердикт 14.09.2026). */
const rawConversations: Omit<ConversationListItem, 'pinned' | 'muted' | 'snoozed'>[] = [
  {
    id: cid(1),
    type: 'project_channel',
    title: 'Новости компании',
    avatarUrl: null,
    project: null,
    task: null,
    letter: null,
    membersPreview: [
      userRef(userIds.klimovich),
      userRef(userIds.shaiderova),
      userRef(userIds.vinnichek),
    ],
    lastMessage: null,
    unreadCount: 2,
  },
  {
    id: cid(2),
    type: 'project_channel',
    title: projectRefs.p3.name,
    avatarUrl: null,
    project: projectRefs.p3,
    task: null,
    letter: null,
    membersPreview: [userRef(userIds.klevantovich), userRef(userIds.klimovich)],
    lastMessage: null,
    unreadCount: 0,
  },
  {
    id: cid(6),
    type: 'project_channel',
    title: projectRefs.p1.name,
    avatarUrl: null,
    project: projectRefs.p1,
    task: null,
    letter: null,
    membersPreview: [userRef(userIds.klimovich), userRef(userIds.shaiderova)],
    lastMessage: null,
    unreadCount: 1,
  },
  {
    id: cid(7),
    type: 'project_channel',
    title: projectRefs.p2.name,
    avatarUrl: null,
    project: projectRefs.p2,
    task: null,
    letter: null,
    membersPreview: [userRef(userIds.akulich), userRef(userIds.klimovich)],
    lastMessage: null,
    unreadCount: 0,
  },
  {
    id: cid(8),
    type: 'project_channel',
    title: projectRefs.p4.name,
    avatarUrl: null,
    project: projectRefs.p4,
    task: null,
    letter: null,
    membersPreview: [userRef(userIds.vinnichek), userRef(userIds.klimovich)],
    lastMessage: null,
    unreadCount: 3,
  },
  {
    id: cid(3),
    type: 'group',
    title: 'BIM-команда',
    avatarUrl: null,
    project: null,
    task: null,
    letter: null,
    membersPreview: [userRef(userIds.klevantovich), userRef(userIds.akulich)],
    lastMessage: null,
    unreadCount: 0,
  },
  {
    id: cid(4),
    type: 'direct',
    title: null,
    avatarUrl: null,
    project: null,
    task: null,
    letter: null,
    membersPreview: [userRef(userIds.vinnichek)],
    lastMessage: null,
    unreadCount: 1,
  },
  {
    id: cid(5),
    type: 'direct',
    title: null,
    avatarUrl: null,
    project: null,
    task: null,
    letter: null,
    membersPreview: [userRef(userIds.polomar)],
    lastMessage: null,
    unreadCount: 0,
  },
  {
    // «Заметки» — диалог с собой (модель Битрикс24): живёт в списке бесед
    // мессенджера и в экспресс-ленте правой полосы ПОСТОЯННО (вердикт
    // владельца 15.09.2026: «заметки пропали даже в мессенджере»).
    id: cid(11),
    type: 'direct',
    title: null,
    avatarUrl: null,
    project: null,
    task: null,
    letter: null,
    membersPreview: [userRef(userIds.klimovich)],
    lastMessage: null,
    unreadCount: 0,
  },
  {
    id: cid(9),
    type: 'task',
    title: null,
    avatarUrl: null,
    project: null,
    task: { id: tid(5), number: 105, title: 'Подготовить ответ заказчику по замечаниям' },
    letter: null,
    membersPreview: [userRef(userIds.klimovich), userRef(userIds.vinnichek)],
    lastMessage: null,
    unreadCount: 1,
  },
  {
    id: cid(10),
    type: 'task',
    title: null,
    avatarUrl: null,
    project: null,
    task: { id: tid(2), number: 102, title: 'Разработать модель 3D по облаку точек' },
    letter: null,
    membersPreview: [userRef(userIds.klimovich), userRef(userIds.matorin)],
    lastMessage: null,
    unreadCount: 0,
  },
];

/** Беседы писем (chat-letters.ts) доливаются в общий список: флаги состояния
 *  (ПКМ-меню) у них те же, lastMessage считается общим циклом ниже. */
export const demoConversations: ConversationListItem[] = [
  ...rawConversations,
  ...rawLetterConversations,
].map((c) => ({ ...c, pinned: false, muted: false, snoozed: false }));

// Демо-состояния контекстного меню: канал закреплён, группа без звука.
const pinnedDemo = demoConversations.find((c) => c.id === cid(1));
if (pinnedDemo) pinnedDemo.pinned = true;
const mutedDemo = demoConversations.find((c) => c.id === cid(3));
if (mutedDemo) mutedDemo.muted = true;

/** Единый стор ленты: сообщения каналов/личных/задач + чаты писем
 *  (chat-letters.ts) —ConversationPane и мессенджер читают один массив. */
export const demoMessages: ChatMessage[] = [...channelMessages, ...letterMessages];

for (const conversation of demoConversations) {
  const last = [...demoMessages]
    .reverse()
    .find((m) => m.conversationId === conversation.id && m.threadRootId === null);
  conversation.lastMessage = last ?? null;
}

/** Закрепы сообщений (демо A3). Снапшот — ССЫЛКА на объект сообщения в
 *  demoMessages: правка/удаление закреплённого реактивно видны в пин-баре
 *  (канон Telegram: бар строится от айтема). Порядок: свежий закреп первым. */
function pinOf(messageId: string, pinnedBy: string, pinnedAt: string): MessagePin | null {
  const message = demoMessages.find((m) => m.id === messageId);
  return message ? { message, pinnedBy: userRef(pinnedBy), pinnedAt } : null;
}

export const demoPins: MessagePin[] = (
  [
    pinOf(mid(1), userIds.klimovich, isoAgo(0, 9, 50)),
    pinOf(mid(2), userIds.shaiderova, isoAgo(1, 14, 0)),
    pinOf(mid(5), userIds.vinnichek, isoAgo(0, 12, 0)),
  ] as (MessagePin | null)[]
).filter((p): p is MessagePin => p !== null);
