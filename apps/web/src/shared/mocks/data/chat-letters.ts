// I5-обоснование: плоский мок-набор чатов писем (данные, не god-object) —
// одна ответственность «демо-обсуждения корреспонденции»; вынесен из chat.ts
// (лимит строк), стор ленты общий (demoMessages = каналы + письма).
import type { ChatMessage, ConversationListItem } from '@nodus/contracts';

import { cid, mid } from './chat-ids.js';
import { isoAgo } from './dates.js';
import { letterStages } from './letter-catalog.js';
import { MISTAKE_REASON } from './letter-history-seed.js';
import { lid } from './letter-ids.js';
import { userIds, userRef } from './users.js';

// draft/visibility/description доливаются map-ом в chat.ts (контракт #91):
// демо-литералы писем о них не знают.
type RawConversation = Omit<
  ConversationListItem,
  | 'pinned'
  | 'muted'
  | 'snoozed'
  | 'draft'
  | 'visibility'
  | 'description'
  | 'myRole'
  | 'permissions'
  | 'myLastReadSeq'
  | 'membersCount'
  | 'lastActivityAt'
>;

/** Чаты писем (type=letter, #55 Р10): беседа есть только у
 *  зарегистрированных писем с обсуждением; состав — адресат и
 *  присоединившиеся (регистратор — нет, В2). Остальные беседы создаёт
 *  find-or-create `GET /chat/conversations/by-letter/:id`. */
export const rawLetterConversations: RawConversation[] = [
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
    id: cid(102),
    type: 'letter',
    title: null,
    avatarUrl: null,
    project: null,
    task: null,
    letter: {
      id: lid(2),
      regNumber: 'Вх-2026/109',
      subject: 'О согласовании изменений в проектную документацию (корпус Б)',
    },
    membersPreview: [userRef(userIds.klimovich), userRef(userIds.vinnichek)],
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
      regNumber: 'Вх-2026/112',
      subject: 'Счёт-фактура № 418 за сентябрь 2026 года',
    },
    membersPreview: [userRef(userIds.klimovich)],
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
    seq: n,
    clientMessageId: `demo-letter-${n}`,
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
    readBy: [],
    urgent: false,
    mentionedUserIds: [],
    linkPreview: null,
    createdAt,
    ...extra,
  };
}

/** Внутренние обсуждения писем: разбор замечаний КЖ, изменения по корпусу Б,
 *  блок отмены регистрации с причиной (Р10, как блок перехода задачи #380). */
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
    44,
    102,
    userIds.klimovich,
    'Посмотрел состав изменений по ОВиК — готовы обсудить на совещании, возражений нет.',
    isoAgo(6, 9, 58),
  ),
  msg(46, 106, userIds.karpovich, MISTAKE_REASON, isoAgo(4, 11, 20), {
    kind: 'letter_transition',
    block: {
      kind: 'letter_transition',
      letterId: lid(6),
      recordId: 'c6000000-0000-4000-8000-000000000046',
      transitionName: 'Отменить регистрацию',
      fromStageName: letterStages.onResolution.name,
      toStageName: letterStages.registeredByMistake.name,
      toStageColor: letterStages.registeredByMistake.color,
      commentLabel: 'Причина',
    },
  }),
];
