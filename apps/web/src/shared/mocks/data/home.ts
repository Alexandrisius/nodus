import type { BirthdayEntry, CompanyNewsItem, CompanyPhoto, CompanyStats } from '@nodus/contracts';

import { isoAgo, isoDateIn } from './dates.js';
import { userIds, userRef } from './users.js';

/** Корпоративная витрина: показатели компании, новости, фото, дни рождения. */

export const demoStats: CompanyStats = {
  employeeCount: 170,
  projectsDone: 128,
  revenueByn: 42_000_000,
  dataNodes: 248_919,
};

export const demoNews: CompanyNewsItem[] = [
  {
    id: 'c0000000-0000-4000-8000-000000000101',
    title: 'Победа в республиканском архитектурном конкурсе',
    text: 'Команда Полины Винничек взяла первое место за концепцию общественного центра «Маяк». Гордимся и поздравляем!',
    publishedAt: isoAgo(0, 6, 10),
  },
  {
    id: 'c0000000-0000-4000-8000-000000000102',
    title: 'С днём рождения, Ольга!',
    text: 'Весь коллектив поздравляет Ольгу Карпович! Желаем точных расчётов, лёгких согласований и неиссякаемого вдохновения.',
    publishedAt: isoAgo(0, 9, 0),
  },
  {
    id: 'c0000000-0000-4000-8000-000000000103',
    title: 'BIM-библиотека переведена на новый шаблон',
    text: 'BIM-отдел завершил перевод библиотеки семейств: более 1 200 семейств приведены к стандарту 2026 года. Инструкция — в канале I005.',
    publishedAt: isoAgo(2, 4, 40),
  },
  {
    id: 'c0000000-0000-4000-8000-000000000104',
    title: 'Корпоративный обед в пятницу',
    text: 'В пятницу в 15:00 собираемся в атриуме офиса — отмечаем завершение стадии Р по объекту 0359. Приходите всей командой!',
    publishedAt: isoAgo(3, 2, 15),
  },
];

export const demoPhotos: CompanyPhoto[] = [
  {
    id: 'c0000000-0000-4000-8000-000000000201',
    src: '/photos/team-1.jpg',
    caption: 'Команда отмечает завершение этапа 0359',
  },
  {
    id: 'c0000000-0000-4000-8000-000000000202',
    src: '/photos/team-2.jpg',
    caption: 'BIM-отдел после релиза новой библиотеки',
  },
  {
    id: 'c0000000-0000-4000-8000-000000000203',
    src: '/photos/team-3.jpg',
    caption: 'Корпоративный день в офисе',
  },
];

export const demoBirthdays: BirthdayEntry[] = [
  { user: userRef(userIds.engineer2), birthDate: isoDateIn(0), isToday: true },
  { user: userRef(userIds.director), birthDate: isoDateIn(5), isToday: false },
];
