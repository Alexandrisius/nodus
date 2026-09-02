import type { TaskStage } from '@nodus/contracts';

const sid = (n: number): string => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Стадии статус-схемы по умолчанию (I15: в бою — справочник, не enum). */
export const stageNew: TaskStage = { id: sid(1), name: 'Новые', order: 0, systemState: 'backlog' };
export const stagePlanned: TaskStage = {
  id: sid(2),
  name: 'Запланировано',
  order: 1,
  systemState: 'backlog',
};
export const stageInProgress: TaskStage = {
  id: sid(3),
  name: 'В работе',
  order: 2,
  systemState: 'active',
};
export const stageOnControl: TaskStage = {
  id: sid(4),
  name: 'Ждёт контроля',
  order: 3,
  systemState: 'active',
};
export const stageDone: TaskStage = {
  id: sid(5),
  name: 'Завершена',
  order: 4,
  systemState: 'done',
};
export const stagePostponed: TaskStage = {
  id: sid(6),
  name: 'Отложена',
  order: 5,
  systemState: 'paused',
};

export const demoStages: TaskStage[] = [
  stageNew,
  stagePlanned,
  stageInProgress,
  stageOnControl,
  stageDone,
  stagePostponed,
];
