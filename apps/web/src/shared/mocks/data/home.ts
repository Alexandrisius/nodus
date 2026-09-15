import type { BirthdayEntry, CompanyNewsItem, CompanyStats, HomeSummary } from '@nodus/contracts';

import { isoAgo, isoDateIn } from './dates.js';
import { userIds, userRef } from './users.js';

/** Корпоративная витрина: показатели компании, лента новостей, дни рождения. */

export const demoStats: CompanyStats = {
  employeeCount: 170,
  projectsDone: 128,
  dataNodes: 248_919,
};

export const demoNews: CompanyNewsItem[] = [
  {
    id: 'c0000000-0000-4000-8000-000000000101',
    author: userRef(userIds.vinnichek),
    title: 'Победа в республиканском архитектурном конкурсе',
    text: 'Команда Полины Винничек взяла первое место за концепцию общественного центра «Маяк». Гордимся и поздравляем!',
    publishedAt: isoAgo(0, 6, 10),
    likesCount: 24,
    commentsCount: 7,
  },
  {
    id: 'c0000000-0000-4000-8000-000000000102',
    author: userRef(userIds.shaiderova),
    title: 'С днём рождения, Ольга!',
    text: 'Весь коллектив поздравляет Ольгу Карпович! Желаем точных расчётов, лёгких согласований и неиссякаемого вдохновения.',
    publishedAt: isoAgo(0, 9, 0),
    likesCount: 18,
    commentsCount: 4,
  },
  {
    id: 'c0000000-0000-4000-8000-000000000103',
    author: userRef(userIds.klevantovich),
    title: 'BIM-библиотека переведена на новый шаблон',
    text: 'BIM-отдел завершил перевод библиотеки семейств: более 1 200 семейств приведены к стандарту 2026 года. Инструкция — в канале I005.',
    publishedAt: isoAgo(2, 4, 40),
    likesCount: 31,
    commentsCount: 9,
  },
  {
    id: 'c0000000-0000-4000-8000-000000000104',
    author: userRef(userIds.klimovich),
    title: 'Корпоративный обед в пятницу',
    text: 'В пятницу в 15:00 собираемся в атриуме офиса — отмечаем завершение стадии Р по объекту 0359. Приходите всей командой!',
    publishedAt: isoAgo(3, 2, 15),
    likesCount: 15,
    commentsCount: 3,
  },
];

export const demoLabor: HomeSummary['labor'] = {
  weeks: [
    { label: 'Нед 32', hours: 612 },
    { label: 'Нед 33', hours: 648 },
    { label: 'Нед 34', hours: 701 },
    { label: 'Нед 35', hours: 684 },
    { label: 'Нед 36', hours: 742 },
    { label: 'Нед 37', hours: 693 },
  ],
  topOvertime: [
    { user: userRef(userIds.matorin), hours: 14 },
    { user: userRef(userIds.klevantovich), hours: 11 },
    { user: userRef(userIds.vinnichek), hours: 8 },
    { user: userRef(userIds.kuralenya), hours: 6 },
  ],
};

export const demoBirthdays: BirthdayEntry[] = [
  { user: userRef(userIds.karpovich), birthDate: isoDateIn(0), isToday: true },
  { user: userRef(userIds.klimovich), birthDate: isoDateIn(5), isToday: false },
];
