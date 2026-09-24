// I5-обоснование: плоский мок-набор чатов писем (данные, не god-object) —
// одна ответственность «демо-обсуждения корреспонденции»; вынесен из chat.ts
// (лимит строк), стор ленты общий (demoMessages = каналы + письма).
import type { ChatMessage, ConversationListItem } from '@nodus/contracts';

import { cid, mid } from './chat-ids.js';
import { isoAgo } from './dates.js';
import { lid } from './letter-bodies.js';
import { userIds, userRef } from './users.js';

// draft/visibility/description доливаются map-ом в chat.ts (контракт #91):
// демо-литералы писем о них не знают.
type RawConversation = Omit<
  ConversationListItem,
  'pinned' | 'muted' | 'snoozed' | 'draft' | 'visibility' | 'description'
>;

/** Чаты писем (type=letter): обсуждение письма — только внутренние
 *  сотрудники (получатели/копии/адресат/позванные), наружу не уходит.
 *  Беседа есть у каждого письма демо-набора (cid(100+n) ↔ lid(n)). */
export const rawLetterConversations: RawConversation[] = [
  {
    id: cid(101),
    type: 'letter',
    title: null,
    avatarUrl: null,
    project: null,
    task: null,
    letter: {
      id: lid(1),
      regNumber: null,
      subject: 'О согласовании изменений в проектную документацию (корпус Б)',
    },
    membersPreview: [
      userRef(userIds.shaiderova),
      userRef(userIds.klimovich),
      userRef(userIds.vinnichek),
    ],
    lastMessage: null,
    unreadCount: 2,
  },
  {
    id: cid(102),
    type: 'letter',
    title: null,
    avatarUrl: null,
    project: null,
    task: null,
    letter: {
      id: lid(2),
      regNumber: null,
      subject: 'О проведении плановой проверки проектной организации',
    },
    membersPreview: [userRef(userIds.shaiderova), userRef(userIds.karpovich)],
    lastMessage: null,
    unreadCount: 0,
  },
  {
    id: cid(103),
    type: 'letter',
    title: null,
    avatarUrl: null,
    project: null,
    task: null,
    letter: {
      id: lid(3),
      regNumber: 'Вх-2026/115',
      subject: 'Замечания по разделу КЖ главного корпуса (этап 0359)',
    },
    membersPreview: [
      userRef(userIds.klimovich),
      userRef(userIds.vinnichek),
      userRef(userIds.matorin),
    ],
    lastMessage: null,
    unreadCount: 1,
  },
  {
    id: cid(104),
    type: 'letter',
    title: null,
    avatarUrl: null,
    project: null,
    task: null,
    letter: {
      id: lid(4),
      regNumber: 'Вх-2026/116',
      subject: 'Коммерческое предложение по вентиляционному оборудованию',
    },
    membersPreview: [userRef(userIds.vinnichek), userRef(userIds.klimovich)],
    lastMessage: null,
    unreadCount: 0,
  },
  {
    id: cid(105),
    type: 'letter',
    title: null,
    avatarUrl: null,
    project: null,
    task: null,
    letter: {
      id: lid(5),
      regNumber: 'Исх-2026/41',
      subject: 'О готовности раздела АР к передаче заказчику',
    },
    membersPreview: [userRef(userIds.klimovich)],
    lastMessage: null,
    unreadCount: 0,
  },
  {
    id: cid(106),
    type: 'letter',
    title: null,
    avatarUrl: null,
    project: null,
    task: null,
    letter: {
      id: lid(6),
      regNumber: 'Исх-2026/40',
      subject: 'О рассмотрении коммерческого предложения',
    },
    membersPreview: [userRef(userIds.vinnichek)],
    lastMessage: null,
    unreadCount: 0,
  },
  {
    id: cid(107),
    type: 'letter',
    title: null,
    avatarUrl: null,
    project: null,
    task: null,
    letter: {
      id: lid(7),
      regNumber: 'Вх-2026/117',
      subject: 'О графике монтажа металлоконструкций (этап 0359)',
    },
    membersPreview: [userRef(userIds.matorin), userRef(userIds.klimovich)],
    lastMessage: null,
    unreadCount: 0,
  },
];

function msg(
  n: number,
  conversation: number,
  author: string,
  text: string,
  createdAt: string,
  extra?: Partial<ChatMessage>,
): ChatMessage {
  return {
    id: mid(n),
    conversationId: cid(conversation),
    author: userRef(author),
    text,
    replyToId: null,
    reply: null,
    deletedAt: null,
    pinned: false,
    forwardedFrom: null,
    threadRootId: null,
    threadRepliesCount: 0,
    reactions: [],
    attachments: [],
    editedAt: null,
    readAt: author === userIds.klimovich ? createdAt : null,
    createdAt,
    ...extra,
  };
}

/** Обсуждения под письмами (внутренние): разбор замечаний КЖ, очередь
 *  регистрации письма заказчика, рассмотрение КП. */
export const letterMessages: ChatMessage[] = [
  msg(
    40,
    103,
    userIds.vinnichek,
    'Замечания «Галургии» по КЖ: четыре пункта, критичные — армирование плит и анкеровка узлов.',
    isoAgo(2, 9, 30),
    { threadRepliesCount: 1 },
  ),
  msg(
    41,
    103,
    userIds.klimovich,
    'Принял в работу. Узлы КЖ-14/18 уточняем с Артёмом, ведомость стали проверит Денис.',
    isoAgo(2, 8, 15),
    { threadRootId: mid(40) },
  ),
  msg(
    42,
    103,
    userIds.matorin,
    'По анкеровке соберу схемы к четвергу, приложу расчёт заделки.',
    isoAgo(1, 17, 45),
  ),
  msg(
    43,
    101,
    userIds.shaiderova,
    'Письмо заказчика по корпусу Б — регистрирую сегодня, адресат Александр.',
    isoAgo(0, 9, 40),
  ),
  msg(
    44,
    101,
    userIds.klimovich,
    'Посмотрел состав изменений по ОВиК — готовы к регистрации, возражений нет.',
    isoAgo(0, 9, 58),
  ),
  msg(
    45,
    104,
    userIds.vinnichek,
    'КП по вентиляции: сравню с проектной спецификацией, итог рассмотрения — к пятнице.',
    isoAgo(1, 10, 30),
  ),
];
