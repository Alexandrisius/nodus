import type { TaskListItem } from '@nodus/contracts';

import { isoAgo, isoIn } from './dates.js';
import { mk, projectRefs, tid } from './task-item-factory.js';
import {
  stageCancelled,
  stageDone,
  stageInProgress,
  stageNew,
  stageOnControl,
  stagePostponed,
  systemProcessType,
} from './task-stages.js';
import { userIds, userRef } from './users.js';

/** Объёмный набор для проверок производительности канбана/списка (industry:
 * колонки держат сотни карточек, подгружаются курсорными страницами).
 * Детерминированный генератор без Math.random — стабильные скриншоты/тесты. */
const BULK_TITLES = [
  'Проверить узлы примыкания плит перекрытия',
  'Подготовить исполнительную документацию по этажу',
  'Согласовать раздел ВК с заказчиком',
  'Запросить спецификацию вентустановок у поставщика',
  'Свести ведомость объёмов работ по корпусу Б',
  'Обновить график производства работ',
  'Проверить армирование монолитных участков',
  'Подготовить ответ на замечания экспертизы',
  'Согласовать кабельные трассы с энергетиками',
  'Проверить отметки фундаментной плиты',
  'Выпустить ревизию чертежей раздела АР',
  'Свести пересечения с разделом НВК',
];
const BULK_STAGES = [
  stageNew,
  stageInProgress,
  stageOnControl,
  stageDone,
  stagePostponed,
  stageCancelled,
];
const BULK_USERS = [
  userIds.klimovich,
  userIds.polomar,
  userIds.klevantovich,
  userIds.voronina,
  userIds.matorin,
  userIds.karpovich,
];

/** 110 задач №201–310: первая половина — «Завершена» (колонка держит
 *  объём, как в бою), остальные — по стадиям каталога по кругу. */
export function makeBulkDemoTasks(): TaskListItem[] {
  const out: TaskListItem[] = [];
  for (let i = 0; i < 110; i++) {
    const n = 201 + i;
    const title = BULK_TITLES[i % BULK_TITLES.length];
    const user = BULK_USERS[i % BULK_USERS.length];
    if (!title || !user) continue;
    out.push(
      mk({
        id: tid(1000 + n),
        number: n,
        title: `${title} (${1 + (i % 4)})`,
        type: systemProcessType,
        stage: i < 55 ? stageDone : (BULK_STAGES[i % BULK_STAGES.length] ?? stageNew),
        priority: (['low', 'normal', 'high', 'urgent'] as const)[i % 4] ?? 'normal',
        deadline: i % 3 === 0 ? isoIn((i % 14) - 3, 12 + (i % 8)) : null,
        creator: userRef(user),
        assignee: i % 5 === 0 ? null : userRef(user),
        participants: [],
        project: i % 4 === 0 ? projectRefs.p4 : i % 4 === 1 ? projectRefs.p2 : null,
        parentId: i % 11 === 0 ? tid(1) : null,
        spentMinutes: (i * 37) % 480,
        commentsCount: i % 4,
        checklistDone: 0,
        checklistTotal: 0,
        source: i % 7 === 0 ? 'letter' : 'manual',
        updatedAt: isoAgo(i % 9, i % 24),
      }),
    );
  }
  return out;
}
