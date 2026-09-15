import { taskStagesKey } from './task-stages.js';

/** Ключи кэша задач — CANONICAL в shared (потребители: фича задач и
 *  общие компоненты создания `shared/tasks`; фича реэкспортирует из
 *  `api/tasks-api.ts` для обратной совместимости). */
export const tasksKeys = {
  all: ['tasks'] as const,
  list: () => [...tasksKeys.all, 'list'] as const,
  listPages: () => [...tasksKeys.all, 'list-pages'] as const,
  /** Общий каталог стадий — ключ из shared (потребители: задачи, проекты). */
  stages: () => taskStagesKey,
  personalStages: () => [...tasksKeys.all, 'personal-stages'] as const,
  detail: (id: string) => [...tasksKeys.all, 'detail', id] as const,
  messages: (id: string) => [...tasksKeys.all, 'messages', id] as const,
  branch: (id: string) => [...tasksKeys.all, 'branch', id] as const,
  relations: (id: string) => [...tasksKeys.all, 'relations', id] as const,
};
