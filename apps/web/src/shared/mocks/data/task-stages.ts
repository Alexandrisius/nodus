import type { TaskStage } from '@nodus/contracts';

const sid = (n: number): string => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Стадии статус-схемы по умолчанию (I15: в бою — справочник, не enum).
 *  Зеркало каталога API `DEFAULT_TASK_WORKFLOW`
 *  (`apps/api/src/modules/tasks/catalog/system-catalog.ts`): имена, цвета,
 *  systemState и порядок — 1:1 (мок ≠ контракту = баг, patterns.md).
 *  «Ждёт контроля» — done (сдана, ждёт приёмки), «Завершена»/«Отменена» —
 *  closed. Порядок order — порядок записей каталога. */
export const stageNew: TaskStage = {
  id: sid(1),
  name: 'Новая',
  order: 0,
  systemState: 'backlog',
  color: 'neutral',
};
export const stageInProgress: TaskStage = {
  id: sid(3),
  name: 'В работе',
  order: 1,
  systemState: 'active',
  color: 'success',
};
export const stageOnControl: TaskStage = {
  id: sid(4),
  name: 'Ждёт контроля',
  order: 2,
  systemState: 'done',
  color: 'warning',
};
export const stageDone: TaskStage = {
  id: sid(5),
  name: 'Завершена',
  order: 3,
  systemState: 'closed',
  color: 'info',
};
export const stagePostponed: TaskStage = {
  id: sid(6),
  name: 'Отложена',
  order: 4,
  systemState: 'paused',
  color: 'neutral',
};
export const stageCancelled: TaskStage = {
  id: sid(7),
  name: 'Отменена',
  order: 5,
  systemState: 'closed',
  color: 'danger',
};

export const demoStages: TaskStage[] = [
  stageNew,
  stageInProgress,
  stageOnControl,
  stageDone,
  stagePostponed,
  stageCancelled,
];

/** Системный тип задачи (ADR-0020: ступень 1 — единственный «Задача»). */
export const systemTaskType = {
  id: '20000000-0000-4000-8000-000000000900',
  code: 'task',
  name: 'Задача',
} as const;
