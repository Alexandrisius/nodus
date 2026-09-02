import type { BirthdayEntry, FeedPost } from '@nodus/contracts';

import { isoAgo, isoDateIn } from './dates.js';
import { userIds, userRef } from './users.js';

export const demoFeed: FeedPost[] = [
  {
    id: 'c0000000-0000-4000-8000-000000000001',
    author: userRef(userIds.hr),
    text: 'С Днём Рождения, Ольга! Желаем лёгких согласований и точных расчётов!',
    likesCount: 16,
    commentsCount: 4,
    createdAt: isoAgo(0, 8, 43),
  },
  {
    id: 'c0000000-0000-4000-8000-000000000002',
    author: userRef(userIds.architect),
    text: 'Вероника молодец! Поздравляем с завершением аттестации.',
    likesCount: 9,
    commentsCount: 2,
    createdAt: isoAgo(1, 9, 6),
  },
  {
    id: 'c0000000-0000-4000-8000-000000000003',
    author: userRef(userIds.bimLead),
    text: 'BIM-отдел завершил перевод библиотеки семейств на новый шаблон. Инструкция — в канале I005.',
    likesCount: 12,
    commentsCount: 5,
    createdAt: isoAgo(1, 17, 25),
  },
];

export const demoBirthdays: BirthdayEntry[] = [
  { user: userRef(userIds.engineer2), birthDate: isoDateIn(0), isToday: true },
  { user: userRef(userIds.director), birthDate: isoDateIn(5), isToday: false },
];
