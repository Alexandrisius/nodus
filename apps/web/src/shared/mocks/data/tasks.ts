import type { ChatMessage, TaskChainNode, TaskDetail, TaskListItem } from '@nodus/contracts';

import type { ProjectRef } from '@nodus/contracts';

import { isoAgo } from './dates.js';
import { personalNew, personalStageFor } from './personal-stages.js';
import { kjSubtask, tid } from './task-items.js';
import { stageNew } from './task-stages.js';
import { currentAuthUser, userIds, userRef } from './users.js';

export * from './task-stages.js';
export * from './personal-stages.js';
export * from './task-items.js';

export function makeSubtask(parent: TaskListItem, title: string): TaskListItem {
  return {
    id: crypto.randomUUID(),
    number: parent.number * 100 + ((demoSubtasks[parent.id]?.length ?? 0) + 1),
    title,
    stage: stageNew,
    // Новая подзадача — в первую личную колонку состояния backlog (ADR-0008).
    personalStageId: personalNew.id,
    priority: 'normal',
    deadline: null,
    creator: userRef(userIds.klimovich),
    assignee: parent.assignee,
    participants: [],
    project: parent.project,
    parentId: parent.id,
    spentMinutes: 0,
    commentsCount: 0,
    checklistDone: 0,
    checklistTotal: 0,
    source: 'manual',
    updatedAt: new Date().toISOString(),
  };
}

export const demoSubtasks: Record<string, TaskListItem[]> = {
  [tid(2)]: [kjSubtask],
};

/** Задача-поручение из резолюции письма (модель v2): чистый конструктор —
 *  мок-хендлер POST /letters/:id/resolutions и unit-тесты ходят через него.
 *  Срок поручения — дата (yyyy-mm-dd), в задаче становится дедлайном 18:00
 *  локального дня. */
export function makeInstructionTask(opts: {
  id: string;
  number: number;
  title: string;
  assigneeId: string;
  deadline: string | null;
  project: ProjectRef | null;
}): TaskListItem {
  return {
    id: opts.id,
    number: opts.number,
    title: opts.title,
    stage: stageNew,
    personalStageId: personalStageFor(stageNew),
    priority: 'normal',
    deadline: opts.deadline ? new Date(`${opts.deadline}T18:00:00`).toISOString() : null,
    creator: userRef(currentAuthUser.id),
    assignee: userRef(opts.assigneeId),
    participants: [],
    project: opts.project,
    parentId: null,
    spentMinutes: 0,
    commentsCount: 0,
    checklistDone: 0,
    checklistTotal: 0,
    source: 'letter',
    updatedAt: new Date().toISOString(),
  };
}

/** Задачи-поручения из письма lid(3) («Замечания по разделу КЖ», Вх-2026/115):
 *  резолюция Р-57 породила три поручения разным людям (tid 5/12/13). */
const LETTER_ID_3 = '80000000-0000-4000-8000-000000000003'; // lid(3), см. letter-bodies.ts
const LETTER_3_NODE: TaskChainNode = {
  kind: 'letter',
  ref: 'Вх-2026/115',
  label: 'Замечания по разделу КЖ главного корпуса',
  entityId: LETTER_ID_3,
};
const RESOLUTION_57_NODE: TaskChainNode = {
  kind: 'resolution',
  ref: 'Р-57',
  label: 'Устранить замечания по КЖ, срок — до конца недели',
};

/** Префиксы доменных цепочек задач-поручений (Письмо → Резолюция → Поручение):
 *  сид демо-набора здесь, рантим-пополнение — мок-хендлером резолюций
 *  (POST /letters/:id/resolutions). */
export const letterChainPrefix: Record<string, TaskChainNode[]> = {
  [tid(5)]: [
    LETTER_3_NODE,
    RESOLUTION_57_NODE,
    {
      kind: 'instruction',
      ref: 'ПП-57',
      label: 'Подготовить ответ заказчику по замечаниям, скорректировать комплект КЖ',
    },
  ],
  [tid(12)]: [
    LETTER_3_NODE,
    RESOLUTION_57_NODE,
    {
      kind: 'instruction',
      ref: 'ПП-58',
      label: 'Уточнить анкеровку арматуры в узлах КЖ-14 и КЖ-18',
    },
  ],
  [tid(13)]: [
    LETTER_3_NODE,
    RESOLUTION_57_NODE,
    { kind: 'instruction', ref: 'ПП-59', label: 'Проверить ведомость расхода стали по маркам' },
  ],
};

function chainOf(task: TaskListItem): TaskChainNode[] {
  const self: TaskChainNode = { kind: 'task', ref: `№ ${task.number}`, label: task.title };
  const letterPrefix = letterChainPrefix[task.id];
  if (letterPrefix) return [...letterPrefix, self];
  if (task.source === 'chat_message') {
    return [{ kind: 'chat_message', ref: 'Чат', label: 'Задача из сообщения' }, self];
  }
  return [self];
}

/** Детали задач поверх списочного элемента (описание, наблюдатели, чек-лист).
 *  Экспорт — хендлерам создания/чек-листа: записи пополняются в рантайме. */
export const detailsExtra: Record<
  string,
  Pick<TaskDetail, 'description' | 'observers' | 'checklist' | 'createdAt'>
> = {
  [tid(2)]: {
    description:
      'Построить модель 3D по результатам лазерного сканирования: корпус Б, отметки 0.000–+6.000. Источник — облако точек в общем хранилище.',
    observers: [userRef(userIds.karpovich)],
    checklist: [
      { id: '50000000-0000-4000-8000-000000000001', text: 'Выгрузить облако точек', done: true },
      { id: '50000000-0000-4000-8000-000000000002', text: 'Каркас и колонны', done: false },
      { id: '50000000-0000-4000-8000-000000000003', text: 'Свести с разделом КЖ', done: false },
    ],
    createdAt: isoAgo(9),
  },
};

export function taskDetailOf(task: TaskListItem): TaskDetail {
  const extra = detailsExtra[task.id] ?? {
    description: 'Описание уточняется постановщиком.',
    observers: [],
    checklist: [],
    createdAt: task.updatedAt,
  };
  return { ...task, ...extra, subtasks: demoSubtasks[task.id] ?? [], chain: chainOf(task) };
}

const mid = (n: number): string => `60000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const demoTaskMessages: ChatMessage[] = [
  {
    id: mid(1),
    conversationId: tid(2),
    seq: 1,
    author: userRef(userIds.klevantovich),
    text: 'Облако точек выгрузил, качество хорошее. Берись за каркас.',
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
    readAt: null,
    readBy: [],
    createdAt: isoAgo(2, 9, 12),
  },
  {
    id: mid(2),
    conversationId: tid(2),
    seq: 2,
    author: userRef(userIds.klimovich),
    text: 'Принял. К пятнице покажу колонны и балки.',
    replyToId: mid(1),
    reply: null,
    deletedAt: null,
    pinned: false,
    forwardedFrom: null,
    threadRootId: null,
    threadRepliesCount: 0,
    reactions: [{ emoji: '👍', count: 1, mine: false }],
    attachments: [],
    editedAt: null,
    readAt: isoAgo(2, 9, 41),
    readBy: [],
    createdAt: isoAgo(2, 9, 40),
  },
  {
    id: mid(3),
    conversationId: tid(2),
    seq: 3,
    author: userRef(userIds.karpovich),
    text: 'Подскажите, по осям 4–7 расхождения с КЖ, приложила скрин.',
    replyToId: null,
    reply: null,
    deletedAt: null,
    pinned: false,
    forwardedFrom: null,
    threadRootId: null,
    threadRepliesCount: 0,
    reactions: [],
    attachments: [
      {
        id: '70000000-0000-4000-8000-000000000001',
        name: 'расхождения_оси_4-7.pdf',
        size: 182_000,
        mime: 'application/pdf',
        kind: 'file',
        url: '/demo/sample.pdf',
        thumbnailUrl: null,
        width: null,
        height: null,
      },
    ],
    editedAt: null,
    readAt: null,
    readBy: [],
    createdAt: isoAgo(1, 14, 5),
  },
];
