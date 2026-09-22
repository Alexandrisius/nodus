// I5-обоснование: плоский мок-набор сообщений/бесед (данные, не god-object) —
// одна ответственность «демо-контент чата», деление на файлы только дробило
// бы связанные сценарии (треды отсылаются к сообщениям бесед).
import type { ChatMessage, ConversationListItem } from '@nodus/contracts';

import { letterMessages, rawLetterConversations } from './chat-letters.js';
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

/** Лента канала = корневые сообщения (новости-треды); ответы ссылаются на
 *  корень (threadRootId), threadRepliesCount корня = число ответов.
 *  Сообщения чатов писем — в chat-letters.ts (один стор ленты). */
const channelMessages: ChatMessage[] = [
  msg(
    1,
    1,
    userIds.shaiderova,
    'Коллеги, добрый день! В пятницу — корпоративный обед в честь дня рождения Ольги Карпович, начало в 15:00.',
    isoAgo(0, 10, 15),
    {
      reactions: [{ emoji: '🎉', count: 5, mine: true }],
    },
  ),
  msg(
    2,
    1,
    userIds.vinnichek,
    'Делюсь презентацией по итогам архитектурного конкурса — спасибо всем, кто участвовал!',
    isoAgo(1, 14, 33),
    {
      threadRepliesCount: 2,
      reactions: [{ emoji: '❤️', count: 3, mine: false }],
      attachments: [
        {
          id: '70000000-0000-4000-8000-000000000021',
          name: 'презентация_конкурс.pdf',
          size: 2_400_000,
          mime: 'application/pdf',
          kind: 'file',
          url: '/demo/sample.pdf',
          thumbnailUrl: null,
          width: null,
          height: null,
        },
      ],
    },
  ),
  msg(
    7,
    1,
    userIds.klimovich,
    'Поздравляю команду! Презентация отличная, отправил руководству.',
    isoAgo(1, 13, 2),
    {
      threadRootId: mid(2),
    },
  ),
  msg(21, 1, userIds.shaiderova, 'Спасибо! Добавлю итоги в новости портала.', isoAgo(1, 12, 40), {
    threadRootId: mid(2),
  }),

  msg(
    3,
    2,
    userIds.klevantovich,
    'Выкатил обновление семейства колонн, проверьте на своих разделах.',
    isoAgo(0, 9, 5),
  ),
  msg(
    8,
    2,
    userIds.klimovich,
    'Согласовали график выпуска разделов: КЖ — до конца месяца, АР — следующим.',
    isoAgo(1, 11, 20),
    {
      threadRepliesCount: 2,
    },
  ),
  msg(9, 2, userIds.klevantovich, 'КЖ успеваем, нужны исходники по осям 4–7.', isoAgo(1, 10, 44), {
    threadRootId: mid(8),
  }),
  msg(10, 2, userIds.vinnichek, 'Исходники передала, проверьте привязки.', isoAgo(1, 9, 30), {
    threadRootId: mid(8),
  }),

  msg(
    11,
    6,
    userIds.shaiderova,
    'Статус недели по внедрению: обучение завершено на 80%, собираем обратную связь.',
    isoAgo(0, 12, 40),
    {
      threadRepliesCount: 1,
      reactions: [{ emoji: '👍', count: 2, mine: false }],
      attachments: [
        {
          id: '70000000-0000-4000-8000-000000000103',
          name: 'статус_внедрение.png',
          size: 620_000,
          mime: 'image/png',
          kind: 'image',
          url: '/demo/site-1.png',
          thumbnailUrl: '/demo/site-1.png',
          width: 1664,
          height: 928,
        },
      ],
    },
  ),
  msg(
    12,
    6,
    userIds.klimovich,
    'Добавлю сводку в отчёт для руководства к пятнице.',
    isoAgo(0, 11, 58),
    {
      threadRootId: mid(11),
    },
  ),
  msg(
    13,
    6,
    userIds.klimovich,
    'Структура CDE согласована — задача №101 на контроле, закрываем на этой неделе.',
    isoAgo(2, 15, 10),
  ),

  msg(
    14,
    7,
    userIds.akulich,
    'Тесты SmartCon на 2026-м Revit: три падения API на экспорте, завёл задачи.',
    isoAgo(0, 8, 50),
    {
      threadRepliesCount: 1,
    },
  ),
  msg(20, 7, userIds.klimovich, 'Посмотрю сегодня вечером, приоритет высокий.', isoAgo(0, 8, 12), {
    threadRootId: mid(14),
  }),

  msg(
    15,
    8,
    userIds.vinnichek,
    'По письму Вх-2026/115 (замечания КЖ): собираем ответ заказчику, срок до конца недели.',
    isoAgo(2, 9, 30),
    {
      threadRepliesCount: 2,
      reactions: [{ emoji: '📌', count: 2, mine: true }],
    },
  ),
  msg(17, 8, userIds.klimovich, 'Взял в работу, черновик ответа покажу завтра.', isoAgo(2, 8, 15), {
    threadRootId: mid(15),
  }),
  msg(
    18,
    8,
    userIds.matorin,
    'Узлы примыкания уточнил, приложу схемы к ответу.',
    isoAgo(1, 17, 45),
    {
      threadRootId: mid(15),
    },
  ),
  msg(
    16,
    8,
    userIds.vinnichek,
    'Вентиляционное оборудование: коммерческое получено, ждём решение по поставщику.',
    isoAgo(1, 10, 5),
  ),

  msg(
    4,
    3,
    userIds.akulich,
    'Кто тестировал SmartCon на 2026-м Revit? Есть нюансы с API.',
    isoAgo(0, 8, 50),
  ),
  msg(
    22,
    3,
    userIds.klevantovich,
    'Да, падения на экспорте — в канале проекта I004 завели задачи.',
    isoAgo(0, 8, 20),
  ),

  msg(
    5,
    4,
    userIds.vinnichek,
    'Александр, посмотрите, пожалуйста, планировки корпуса Б — отправила в задачу.',
    isoAgo(0, 12, 20),
    {
      attachments: [
        {
          id: '70000000-0000-4000-8000-000000000101',
          name: 'корпус_Б_фасад.png',
          size: 840_000,
          mime: 'image/png',
          kind: 'image',
          url: '/demo/site-1.png',
          thumbnailUrl: '/demo/site-1.png',
          width: 1664,
          height: 928,
        },
        {
          id: '70000000-0000-4000-8000-000000000102',
          name: 'планировка_этажа.png',
          size: 760_000,
          mime: 'image/png',
          kind: 'image',
          url: '/demo/plan-1.png',
          thumbnailUrl: '/demo/plan-1.png',
          width: 928,
          height: 1664,
        },
      ],
    },
  ),
  msg(
    6,
    5,
    userIds.polomar,
    'Подписала у директора входящее от «СтройЗаказчика», передала вам на резолюцию.',
    isoAgo(0, 11, 55),
  ),

  // Чаты задач (вкладка «Чаты задач» мессенджера).
  msg(
    30,
    9,
    userIds.vinnichek,
    'По замечаниям КЖ: черновик ответа посмотрела, два пункта надо раскрыть подробнее.',
    isoAgo(0, 10, 5),
  ),
  msg(
    31,
    9,
    userIds.klimovich,
    'Принял, допишу узлы примыкания и верну на проверку сегодня.',
    isoAgo(0, 10, 40),
  ),
  msg(
    32,
    10,
    userIds.matorin,
    'Облако по осям 4–7 загрузил в CDE, можно начинать сведение.',
    isoAgo(1, 15, 20),
  ),
];

/** Единый стор ленты: сообщения каналов/личных/задач + чаты писем
 *  (chat-letters.ts) —ConversationPane и мессенджер читают один массив. */
export const demoMessages: ChatMessage[] = [...channelMessages, ...letterMessages];

for (const conversation of demoConversations) {
  const last = [...demoMessages]
    .reverse()
    .find((m) => m.conversationId === conversation.id && m.threadRootId === null);
  conversation.lastMessage = last ?? null;
}
