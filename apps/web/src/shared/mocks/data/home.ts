import type { BirthdayEntry, CompanyStats, HomeSummary } from '@nodus/contracts';

import { isoDateIn } from './dates.js';
import { userIds, userRef } from './users.js';

/** Корпоративная витрина (моки дева): показатели компании, трудозатраты,
 *  дни рождения. Контракт — как реальный `GET /home/summary` (модуль home
 *  бэка); на живом контуре без данных блоки просто не рендерятся. */

export const demoStats: CompanyStats = {
  employeeCount: 170,
  projectsDone: 128,
  dataNodes: 248_919,
};

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
