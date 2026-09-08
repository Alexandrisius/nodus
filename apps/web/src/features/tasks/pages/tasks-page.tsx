import { Outlet, useSearch } from '@tanstack/react-router';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { useTasksList } from '../api/tasks-api.js';
import { TaskKanban } from '../components/task-kanban.js';
import { TaskList } from '../components/task-list.js';

/** Задачи: виды «Мой план» (канбан) и «Список» — переключаются в топбаре.
 * Шапка — живая сводка (в работе / просрочено) в моно-стиле контура. */
export function TasksPage() {
  const search = useSearch({ strict: false }) as { view?: string };
  const view = search.view === 'list' ? 'list' : 'kanban';
  const { data } = useTasksList();
  const items = data?.items ?? [];

  const active = items.filter((t) => t.stage.systemState === 'active').length;
  const overdue = items.filter(
    (t) =>
      t.deadline !== null &&
      new Date(t.deadline) < new Date() &&
      t.stage.systemState !== 'done' &&
      t.stage.systemState !== 'closed',
  ).length;

  return (
    <div className="relative flex h-full flex-col">
      <header className="flex items-end justify-between px-6 pt-5 pb-3">
        <h1 className="text-xl font-semibold text-foreground">{ui.tasks.title}</h1>
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase select-none">
          {ui.tasks.summaryActive} <span className="text-foreground tabular-nums">{active}</span>
          <span className="mx-2 text-border">·</span>
          {ui.tasks.summaryOverdue}{' '}
          <span className={cn('tabular-nums', overdue > 0 ? 'text-danger' : 'text-foreground')}>
            {overdue}
          </span>
        </p>
      </header>
      <div className="min-h-0 flex-1">{view === 'list' ? <TaskList /> : <TaskKanban />}</div>
      <Outlet />
    </div>
  );
}
