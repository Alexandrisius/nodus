import type { ChatMessage, TaskDetail, TaskListItem } from '@nodus/contracts';

import { isoAgo } from './dates.js';
import { demoTasks, tid } from './task-items.js';
import { stageNew, stagePlanned } from './task-stages.js';
import { userIds, userRef } from './users.js';

export * from './task-stages.js';
export * from './task-items.js';

export function makeSubtask(parent: TaskListItem, title: string): TaskListItem {
  return {
    id: crypto.randomUUID(),
    number: parent.number * 100 + ((demoSubtasks[parent.id]?.length ?? 0) + 1),
    title,
    stage: stageNew,
    priority: 'normal',
    deadline: null,
    creator: userRef(userIds.klimovich),
    assignee: parent.assignee,
    participants: [],
    project: parent.project,
    spentMinutes: 0,
    commentsCount: 0,
    checklistDone: 0,
    checklistTotal: 0,
    source: 'manual',
    updatedAt: new Date().toISOString(),
  };
}

export const demoSubtasks: Record<string, TaskListItem[]> = {};

const subtaskParent = demoTasks.find((t) => t.id === tid(2));
if (subtaskParent) {
  demoSubtasks[subtaskParent.id] = [
    { ...makeSubtask(subtaskParent, 'Свести каркас с разделом КЖ'), stage: stagePlanned },
  ];
}

const detailsExtra: Record<
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
  return { ...task, ...extra, subtasks: demoSubtasks[task.id] ?? [] };
}

const mid = (n: number): string => `60000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const demoTaskMessages: ChatMessage[] = [
  {
    id: mid(1),
    conversationId: tid(2),
    author: userRef(userIds.klevantovich),
    text: 'Облако точек выгрузил, качество хорошее. Берись за каркас.',
    replyToId: null,
    threadRootId: null,
    threadRepliesCount: 0,
    reactions: [],
    attachments: [],
    editedAt: null,
    createdAt: isoAgo(2, 9, 12),
  },
  {
    id: mid(2),
    conversationId: tid(2),
    author: userRef(userIds.klimovich),
    text: 'Принял. К пятнице покажу колонны и балки.',
    replyToId: mid(1),
    threadRootId: null,
    threadRepliesCount: 0,
    reactions: [{ emoji: '👍', count: 1, mine: false }],
    attachments: [],
    editedAt: null,
    createdAt: isoAgo(2, 9, 40),
  },
  {
    id: mid(3),
    conversationId: tid(2),
    author: userRef(userIds.karpovich),
    text: 'Подскажите, по осям 4–7 расхождения с КЖ, приложила скрин.',
    replyToId: null,
    threadRootId: null,
    threadRepliesCount: 0,
    reactions: [],
    attachments: [
      {
        id: '70000000-0000-4000-8000-000000000001',
        name: 'расхождения_оси_4-7.pdf',
        size: 182_000,
        mime: 'application/pdf',
      },
    ],
    editedAt: null,
    createdAt: isoAgo(1, 14, 5),
  },
];
