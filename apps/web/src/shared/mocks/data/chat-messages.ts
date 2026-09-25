// I5-обоснование: плоский мок-набор СООБЩЕНИЙ чата (данные, не god-object) —
// одна ответственность «демо-контент ленты» (беседы — в chat.ts, письма — в
// chat-letters.ts); деление по сценариям только дробило бы связанные треды.
import type { ChatMessage } from '@nodus/contracts';

import { cid, mid } from './chat-ids.js';
import { isoAgo } from './dates.js';
import { userIds, userRef } from './users.js';

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
    createdAt,
    ...extra,
  };
}

/** Лента канала = корневые сообщения (новости-треды); ответы ссылаются на
 *  корень (threadRootId), threadRepliesCount корня = число ответов.
 *  Сообщения чатов писем — в chat-letters.ts (один стор ленты). */
export const channelMessages: ChatMessage[] = [
  msg(
    1,
    1,
    userIds.shaiderova,
    'Коллеги, добрый день! В пятницу — корпоративный обед в честь дня рождения Ольги Карпович, начало в 15:00.',
    isoAgo(0, 10, 15),
    {
      reactions: [{ emoji: '🎉', count: 5, mine: true }],
      pinned: true,
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
      pinned: true,
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
    {
      replyToId: mid(4),
      reply: {
        id: mid(4),
        author: userRef(userIds.akulich),
        text: 'Кто тестировал SmartCon на 2026-м Revit? Есть нюансы с API.',
        quoteText: null,
        attachmentKind: null,
        deleted: false,
      },
    },
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
      pinned: true,
    },
  ),
  msg(
    23,
    4,
    userIds.klimovich,
    'Планировки посмотрел — вторую пришлите, пожалуйста, в большем разрешении, оси не читаются.',
    isoAgo(0, 11, 40),
    {
      replyToId: mid(5),
      reply: {
        id: mid(5),
        author: userRef(userIds.vinnichek),
        text: 'Александр, посмотрите, пожалуйста, планировки корпуса Б — отправила в задачу.',
        quoteText: null,
        attachmentKind: 'image',
        deleted: false,
      },
    },
  ),
  msg(25, 4, userIds.vinnichek, '', isoAgo(0, 11, 30), {
    deletedAt: isoAgo(0, 11, 10),
    readAt: null,
  }),
  msg(
    6,
    5,
    userIds.polomar,
    'Подписала у директора входящее от «СтройЗаказчика», передала вам на резолюцию.',
    isoAgo(0, 11, 55),
  ),
  msg(24, 5, userIds.klimovich, 'Резолюцию подготовлю сегодня до конца дня.', isoAgo(0, 11, 20), {
    replyToId: mid(6),
    reply: {
      id: mid(6),
      author: userRef(userIds.polomar),
      text: 'Подписала у директора входящее от «СтройЗаказчика», передала вам на резолюцию.',
      quoteText: 'передала вам на резолюцию',
      attachmentKind: null,
      deleted: false,
    },
  }),
  msg(
    26,
    11,
    userIds.klimovich,
    'По письму Вх-2026/115 (замечания КЖ): собираем ответ заказчику, срок до конца недели.',
    isoAgo(0, 10, 50),
    {
      forwardedFrom: {
        author: userRef(userIds.vinnichek),
        conversationId: cid(8),
        messageId: mid(15),
        threadRootId: null,
      },
    },
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
    {
      editedAt: isoAgo(0, 10, 20),
    },
  ),
  msg(
    32,
    10,
    userIds.matorin,
    'Облако по осям 4–7 загрузил в CDE, можно начинать сведение.',
    isoAgo(1, 15, 20),
  ),
];
