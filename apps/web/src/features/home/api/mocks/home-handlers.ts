import type { HomeSummary } from '@nodus/contracts';

import { http, HttpResponse } from 'msw';

import {
  demoBirthdays,
  demoNews,
  demoPhotos,
  demoStats,
} from '../../../../shared/mocks/data/home.js';
import { demoLetters } from '../../../../shared/mocks/data/letters.js';
import { demoTasks } from '../../../../shared/mocks/data/tasks.js';

function buildSummary(): HomeSummary {
  const now = new Date();
  const dayEnd = new Date();
  dayEnd.setHours(23, 59, 59, 999);
  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);

  const open = demoTasks.filter((t) => t.stage.systemState !== 'done');
  const overdue = open.filter((t) => t.deadline && new Date(t.deadline) < now);
  const today = open.filter(
    (t) => t.deadline && new Date(t.deadline) >= now && new Date(t.deadline) <= dayEnd,
  );
  const week = open.filter((t) => t.deadline && new Date(t.deadline) <= weekEnd);

  return {
    tasks: { overdue, today, weekCount: week.length },
    letters: {
      unregisteredCount: demoLetters.filter((l) => l.status === 'unregistered').length,
      recent: demoLetters.filter((l) => l.status !== 'unregistered').slice(0, 4),
    },
    birthdays: demoBirthdays,
    stats: demoStats,
    news: [...demoNews].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
    photos: demoPhotos,
  };
}

export const homeHandlers = [
  http.get('/api/v1/home/summary', () => HttpResponse.json(buildSummary())),
];
