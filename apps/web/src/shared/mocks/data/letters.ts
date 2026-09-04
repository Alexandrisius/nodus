import type { LetterDetail, LetterListItem } from '@nodus/contracts';

import { isoAgo, isoDateIn } from './dates.js';
import { projectRefs, tid } from './tasks.js';
import { userIds, userRef } from './users.js';

export const lid = (n: number): string => `80000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const demoLetters: LetterListItem[] = [
  {
    id: lid(1),
    type: 'incoming',
    regNumber: null,
    regDate: null,
    correspondent: 'ООО «СтройЗаказчик»',
    subject: 'О согласовании изменений в проектную документацию (корпус Б)',
    status: 'unregistered',
    project: null,
    deadline: null,
    receivedAt: isoAgo(0, 9, 12),
  },
  {
    id: lid(2),
    type: 'incoming',
    regNumber: null,
    regDate: null,
    correspondent: 'Министерство архитектуры и строительства',
    subject: 'О проведении плановой проверки проектной организации',
    status: 'unregistered',
    project: null,
    deadline: null,
    receivedAt: isoAgo(1, 16, 40),
  },
  {
    id: lid(3),
    type: 'incoming',
    regNumber: 'Вх-2026/118',
    regDate: isoDateIn(-3),
    correspondent: 'АО «Галургия»',
    subject: 'Замечания по разделу КЖ главного корпуса (этап 0359)',
    status: 'overdue',
    project: projectRefs.p4,
    deadline: isoDateIn(-1),
    receivedAt: isoAgo(3, 11, 20),
  },
  {
    id: lid(4),
    type: 'incoming',
    regNumber: 'Вх-2026/121',
    regDate: isoDateIn(-1),
    correspondent: 'ООО «ТехСнаб»',
    subject: 'Коммерческое предложение по вентиляционному оборудованию',
    status: 'in_work',
    project: projectRefs.p4,
    deadline: isoDateIn(6),
    receivedAt: isoAgo(1, 10, 5),
  },
  {
    id: lid(5),
    type: 'outgoing',
    regNumber: 'Исх-2026/77',
    regDate: isoDateIn(-6),
    correspondent: 'АО «Галургия»',
    subject: 'О готовности раздела АР к передаче заказчику',
    status: 'done',
    project: projectRefs.p4,
    deadline: null,
    receivedAt: isoAgo(6, 15, 0),
  },
];

const letterBodies: Record<string, Pick<LetterDetail, 'body' | 'attachments' | 'resolutions'>> = {
  [lid(1)]: {
    body: 'Уважаемые коллеги! Просим согласовать внесение изменений в проектную документацию по корпусу Б в связи с заменой вентустановок. Прилагаем скорректированные схемы и спецификацию.',
    attachments: [
      {
        id: '70000000-0000-4000-8000-000000000011',
        name: 'письмо_о_согласовании.pdf',
        size: 240_000,
        mime: 'application/pdf',
      },
      {
        id: '70000000-0000-4000-8000-000000000012',
        name: 'спецификация_вентустановки.xlsx',
        size: 88_000,
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    ],
    resolutions: [],
  },
  [lid(2)]: {
    body: 'Уведомляем о проведении плановой проверки деятельности проектной организации в период с 15 по 25 число текущего месяца. Перечень запрашиваемых документов прилагается.',
    attachments: [
      {
        id: '70000000-0000-4000-8000-000000000013',
        name: 'перечень_документов.pdf',
        size: 132_000,
        mime: 'application/pdf',
      },
    ],
    resolutions: [],
  },
  [lid(3)]: {
    body: 'Направляем замечания по разделу КЖ: несоответствие армирования плит перекрытия в осях 4–7, уточнить узлы примыкания. Просим устранить в срок до указанной даты.',
    attachments: [
      {
        id: '70000000-0000-4000-8000-000000000014',
        name: 'замечания_КЖ_0359.pdf',
        size: 512_000,
        mime: 'application/pdf',
      },
    ],
    resolutions: [
      {
        id: '90000000-0000-4000-8000-000000000001',
        text: 'Александру: подготовить ответ заказчику по замечаниям, срок — до конца недели.',
        author: userRef(userIds.klimovich),
        taskId: tid(5),
        createdAt: isoAgo(2, 9, 0),
      },
    ],
  },
  [lid(4)]: {
    body: 'Предлагаем вентиляционное оборудование по приложению. Цены действительны 30 дней.',
    attachments: [],
    resolutions: [],
  },
  [lid(5)]: {
    body: 'Сообщаем о готовности раздела АР. Просим организовать передачу по акту.',
    attachments: [],
    resolutions: [],
  },
};

export function letterDetailOf(letter: LetterListItem): LetterDetail {
  const extra = letterBodies[letter.id] ?? { body: '', attachments: [], resolutions: [] };
  return { ...letter, ...extra };
}
