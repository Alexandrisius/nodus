import type { InfiniteData } from '@tanstack/react-query';
import type { Paginated, TaskListItem } from '@nodus/contracts';

import { taskStagesKey } from './task-stages.js';

/** Ключи кэша задач — CANONICAL в shared (потребители: фича задач и
 *  общие компоненты создания `shared/tasks`; фича реэкспортирует из
 *  `api/tasks-api.ts` для обратной совместимости). Строки ключей руками
 *  не пишутся (patterns.md) — только эта фабрика. */
export const tasksKeys = {
  all: ['tasks'] as const,
  /** Журнал задач — бесконечные страницы (useTasksPages, useProjectTaskPages). */
  listPages: (params?: { projectId?: string }) =>
    params
      ? ([...tasksKeys.all, 'list-pages', params] as const)
      : ([...tasksKeys.all, 'list-pages'] as const),
  /** Доски-канбаны (первые страницы колонок): scope — 'personal' | 'project:<id>'. */
  kanban: (scope: string) => [...tasksKeys.all, 'kanban', scope] as const,
  /** Префикс всех досок — инвалидация мутациями (перенос по степперу, CRUD стадий). */
  kanbanAll: () => [...tasksKeys.all, 'kanban'] as const,
  /** Общий каталог стадий — ключ из shared (потребители: задачи, проекты). */
  stages: () => taskStagesKey,
  personalStages: () => [...tasksKeys.all, 'personal-stages'] as const,
  /** Серверный поиск задач (палитра Ctrl+K). */
  search: (q: string) => [...tasksKeys.all, 'search', q] as const,
  detail: (id: string) => [...tasksKeys.all, 'detail', id] as const,
  messages: (id: string) => [...tasksKeys.all, 'messages', id] as const,
  branch: (id: string) => [...tasksKeys.all, 'branch', id] as const,
  relations: (id: string) => [...tasksKeys.all, 'relations', id] as const,
};

/** Точечное обновление задачи в бесконечном кэше журнала (оптимистичные
 *  мутации переноса, I4): задача встречается на одной из подгруженных страниц. */
export function mapTaskInPages(
  data: InfiniteData<Paginated<TaskListItem>> | undefined,
  taskId: string,
  patch: (t: TaskListItem) => TaskListItem,
): InfiniteData<Paginated<TaskListItem>> | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((p) => ({
      ...p,
      items: p.items.map((t) => (t.id === taskId ? patch(t) : t)),
    })),
  };
}
