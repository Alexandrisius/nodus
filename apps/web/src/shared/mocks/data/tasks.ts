import type { ChatMessage, TaskDetail, TaskListItem } from '@nodus/contracts';

import { isoAgo } from './dates.js';
import { tid } from './task-items.js';
import { userIds, userRef } from './users.js';

export * from './task-stages.js';
export * from './task-items.js';

const detailsExtra: Record<
  string,
  Pick<TaskDetail, 'description' | 'observers' | 'checklist' | 'createdAt'>
> = {
  [tid(2)]: {
    description:
      'Построить модель 3D по результатам лазерного сканирования: корпус Б, отметки 0.000–+6.000. Источник — облако точек в общем хранилище.',
    observers: [userRef(userIds.engineer2)],
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
  return { ...task, ...extra };
}

const mid = (n: number): string => `60000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const demoTaskMessages: ChatMessage[] = [
  {
    id: mid(1),
    conversationId: tid(2),
    author: userRef(userIds.bimLead),
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
    author: userRef(userIds.director),
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
    author: userRef(userIds.engineer2),
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
