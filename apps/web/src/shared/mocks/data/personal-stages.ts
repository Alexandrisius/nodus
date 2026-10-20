import type { TaskListItem, TaskStage } from '@nodus/contracts';

import {
  stageCancelled,
  stageDone,
  stageInProgress,
  stageNew,
  stageOnControl,
  stagePostponed,
} from './task-stages.js';

const sid = (n: number): string => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Личная схема «Мой план» демо-пользователя (экземпляр дефолтного шаблона,
 *  ADR-0008): та же форма стадии, что у проектной схемы; привязка к системному
 *  состоянию — основа встроенного автоперемещения (доска живая без роботов).
 *  Каркас — шаблон API `PERSONAL_TEMPLATE` (system-catalog.ts: каждому из
 *  пяти состояний — минимум одна колонка, «На утверждении» = done, «Завершённые» =
 *  closed); поверх — вольные личные колонки владельца («Стратегические»,
 *  «Проанализировано») внутри состояния active. */
export const personalNew: TaskStage = {
  id: sid(101),
  name: 'Новые',
  order: 0,
  systemState: 'backlog',
  color: 'neutral',
};
export const personalStrategic: TaskStage = {
  id: sid(102),
  name: 'Стратегические',
  order: 1,
  systemState: 'active',
  color: 'info',
};
export const personalInWork: TaskStage = {
  id: sid(103),
  name: 'В работе',
  order: 2,
  systemState: 'active',
  color: 'success',
};
export const personalAnalyzed: TaskStage = {
  id: sid(104),
  name: 'Проанализировано',
  order: 3,
  systemState: 'active',
  color: 'warning',
};
export const personalWaiting: TaskStage = {
  id: sid(105),
  name: 'Ждёт ответа',
  order: 4,
  systemState: 'paused',
  color: 'danger',
};
export const personalOnControl: TaskStage = {
  id: sid(106),
  name: 'На утверждении',
  order: 5,
  systemState: 'done',
  color: 'warning',
};
export const personalDone: TaskStage = {
  id: sid(107),
  name: 'Завершённые',
  order: 6,
  systemState: 'closed',
  color: 'info',
};

export const demoPersonalStages: TaskStage[] = [
  personalNew,
  personalStrategic,
  personalInWork,
  personalAnalyzed,
  personalWaiting,
  personalOnControl,
  personalDone,
];

/** Стартовое размещение задачи на личной доске: из глобальной стадии — в
 *  осмысленную личную колонку того же системного состояния. */
const byGlobalStage: Record<string, TaskStage> = {
  [stageNew.id]: personalNew,
  [stageInProgress.id]: personalInWork,
  [stageOnControl.id]: personalOnControl,
  [stagePostponed.id]: personalWaiting,
  [stageDone.id]: personalDone,
  [stageCancelled.id]: personalDone,
};

/** Первая личная колонка системного состояния (по порядку на доске). */
export function firstPersonalStageOfState(
  stages: TaskStage[],
  systemState: TaskStage['systemState'],
): TaskStage {
  return (
    [...stages].sort((a, b) => a.order - b.order).find((s) => s.systemState === systemState) ??
    [...stages].sort((a, b) => a.order - b.order)[0] ??
    personalNew
  );
}

export function personalStageFor(globalStage: TaskStage): string {
  return (
    byGlobalStage[globalStage.id] ??
    firstPersonalStageOfState(demoPersonalStages, globalStage.systemState)
  ).id;
}

/** Встроенное автоперемещение личной доски (ADR-0008): смена системного
 *  состояния задачи → переезд в первую личную колонку этого состояния;
 *  колонка текущего состояния не трогается (личная организация сохраняется). */
export function autoMovePersonalPlacement(task: TaskListItem, stages: TaskStage[]): void {
  const current = stages.find((s) => s.id === task.personalStageId);
  if (current && current.systemState === task.stage.systemState) return;
  task.personalStageId = firstPersonalStageOfState(stages, task.stage.systemState).id;
}

/** Глобальная стадия для задачи, созданной из личной колонки: первая стадия
 *  схемы того же системного состояния, fallback — «Новые». */
export function globalStageForPersonal(column: TaskStage, stages: TaskStage[]): TaskStage {
  return (
    [...stages]
      .sort((a, b) => a.order - b.order)
      .find((s) => s.systemState === column.systemState) ??
    stages[0] ??
    stageNew
  );
}

/** Удаление личной колонки (ADR-0008): единственную удалить нельзя; задачи
 *  переезжают в первую колонку того же состояния, fallback — первая доски. */
export function deletePersonalStagePure(
  stages: TaskStage[],
  tasks: TaskListItem[],
  stageId: string,
): { ok: boolean; movedTo?: TaskStage } {
  if (stages.length <= 1) return { ok: false };
  const index = stages.findIndex((s) => s.id === stageId);
  const target = stages[index];
  if (!target) return { ok: false };
  const remaining = stages.filter((s) => s.id !== stageId);
  const dest =
    [...remaining]
      .sort((a, b) => a.order - b.order)
      .find((s) => s.systemState === target.systemState) ??
    [...remaining].sort((a, b) => a.order - b.order)[0];
  if (!dest) return { ok: false };
  for (const task of tasks) {
    if (task.personalStageId === stageId) task.personalStageId = dest.id;
  }
  stages.splice(index, 1);
  return { ok: true, movedTo: dest };
}
