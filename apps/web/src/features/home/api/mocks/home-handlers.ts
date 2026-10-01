import type { HomeSummary } from '@nodus/contracts';

import { http, HttpResponse } from 'msw';

import { demoBirthdays, demoLabor, demoStats } from '../../../../shared/mocks/data/home.js';

/** Мок витрины Главной (#100): тот же контракт, что живой `GET /home/summary`
 *  (модуль home бэка) — на деве показывает демо-данные для приёмки вида. */
export const homeHandlers = [
  http.get('/api/v1/home/summary', () =>
    HttpResponse.json({
      birthdays: demoBirthdays,
      stats: demoStats,
      labor: demoLabor,
    } satisfies HomeSummary),
  ),
];
