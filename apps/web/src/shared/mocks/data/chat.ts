import type { ChatMessage, ConversationListItem } from '@nodus/contracts';

import { isoAgo } from './dates.js';
import { projectRefs } from './tasks.js';
import { userIds, userRef } from './users.js';

export const cid = (n: number): string => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const mid = (n: number): string => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const demoConversations: ConversationListItem[] = [
  {
    id: cid(1),
    type: 'project_channel',
    title: 'Новости компании',
    avatarUrl: null,
    project: null,
    membersPreview: [userRef(userIds.director), userRef(userIds.hr), userRef(userIds.architect)],
    lastMessage: null,
    unreadCount: 2,
  },
  {
    id: cid(2),
    type: 'project_channel',
    title: 'I005-Внедрение Revit',
    avatarUrl: null,
    project: projectRefs.p3,
    membersPreview: [userRef(userIds.bimLead), userRef(userIds.director)],
    lastMessage: null,
    unreadCount: 0,
  },
  {
    id: cid(3),
    type: 'group',
    title: 'BIM-команда',
    avatarUrl: null,
    project: null,
    membersPreview: [userRef(userIds.bimLead), userRef(userIds.bimEngineer)],
    lastMessage: null,
    unreadCount: 0,
  },
  {
    id: cid(4),
    type: 'direct',
    title: null,
    avatarUrl: null,
    project: null,
    membersPreview: [userRef(userIds.architect)],
    lastMessage: null,
    unreadCount: 1,
  },
  {
    id: cid(5),
    type: 'direct',
    title: null,
    avatarUrl: null,
    project: null,
    membersPreview: [userRef(userIds.secretary)],
    lastMessage: null,
    unreadCount: 0,
  },
];

export const demoMessages: ChatMessage[] = [
  {
    id: mid(1),
    conversationId: cid(1),
    author: userRef(userIds.hr),
    text: 'Коллеги, добрый день! В пятницу — корпоративный обед в честь дня рождения Ольги Карпович, начало в 15:00.',
    replyToId: null,
    threadRootId: null,
    threadRepliesCount: 0,
    reactions: [{ emoji: '🎉', count: 5, mine: true }],
    attachments: [],
    editedAt: null,
    createdAt: isoAgo(0, 10, 15),
  },
  {
    id: mid(2),
    conversationId: cid(1),
    author: userRef(userIds.architect),
    text: 'Делюсь презентацией по итогам архитектурного конкурса — спасибо всем, кто участвовал!',
    replyToId: null,
    threadRootId: null,
    threadRepliesCount: 1,
    reactions: [{ emoji: '❤️', count: 3, mine: false }],
    attachments: [
      {
        id: '70000000-0000-4000-8000-000000000021',
        name: 'презентация_конкурс.pdf',
        size: 2_400_000,
        mime: 'application/pdf',
      },
    ],
    editedAt: null,
    createdAt: isoAgo(1, 14, 33),
  },
  {
    id: mid(3),
    conversationId: cid(2),
    author: userRef(userIds.bimLead),
    text: 'Выкатил обновление семейства колонн, проверьте на своих разделах.',
    replyToId: null,
    threadRootId: null,
    threadRepliesCount: 0,
    reactions: [],
    attachments: [],
    editedAt: null,
    createdAt: isoAgo(0, 9, 5),
  },
  {
    id: mid(4),
    conversationId: cid(3),
    author: userRef(userIds.bimEngineer),
    text: 'Кто тестировал SmartCon на 2026-м Revit? Есть нюансы с API.',
    replyToId: null,
    threadRootId: null,
    threadRepliesCount: 0,
    reactions: [],
    attachments: [],
    editedAt: null,
    createdAt: isoAgo(0, 8, 50),
  },
  {
    id: mid(5),
    conversationId: cid(4),
    author: userRef(userIds.architect),
    text: 'Александр, посмотрите, пожалуйста, планировки корпуса Б — отправила в задачу.',
    replyToId: null,
    threadRootId: null,
    threadRepliesCount: 0,
    reactions: [],
    attachments: [],
    editedAt: null,
    createdAt: isoAgo(0, 12, 20),
  },
  {
    id: mid(6),
    conversationId: cid(5),
    author: userRef(userIds.secretary),
    text: 'Подписала у директора входящее от «СтройЗаказчика», передала вам на резолюцию.',
    replyToId: null,
    threadRootId: null,
    threadRepliesCount: 0,
    reactions: [],
    attachments: [],
    editedAt: null,
    createdAt: isoAgo(0, 11, 55),
  },
];

for (const conversation of demoConversations) {
  const last = [...demoMessages].reverse().find((m) => m.conversationId === conversation.id);
  conversation.lastMessage = last ?? null;
}
