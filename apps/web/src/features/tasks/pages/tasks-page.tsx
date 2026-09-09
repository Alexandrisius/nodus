import { useEffect } from 'react';
import { Outlet, useSearch } from '@tanstack/react-router';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { ViewSettings } from '../../../shared/views/view-settings.js';
import { useTaskStages } from '../api/tasks-api.js';
import { taskCardFields, taskListFields } from '../lib/task-fields.js';
import { TaskKanban } from '../components/task-kanban.js';
import { TaskList } from '../components/task-list.js';

/** Задачи: виды «Мой план» (канбан) и «Список» — переключаются в топбаре.
 * Шапка — живая сводка из счётчиков каталога стадий (в работе / просрочено;
 * totals в list-ответах запрещены каноном) и шестерёнка представления
 * (отображаемые поля активного вида; ширина колонок — ручкой в хедере
 * таблицы, с памятью между сессиями). */
export function TasksPage() {
  const search = useSearch({ strict: false }) as { view?: string };
  const view = search.view === 'list' ? 'list' : 'kanban';
  const { data: stages } = useTaskStages();

  // Прогрев модулей карточки в простое: первое открытие слайдера не платит
  // «холодную» компиляцию графа модулей (dev: vite компилирует при первом
  // импорте; prod: прогрев парса/кэша) — первая анимация равна последующим.
  useEffect(() => {
    const warm = () => {
      void import('../components/task-card.js');
    };
    const id =
      typeof window.requestIdleCallback === 'function'
        ? window.requestIdleCallback(warm)
        : window.setTimeout(warm, 400);
    return () => {
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(id);
      else window.clearTimeout(id);
    };
  }, []);

  const active =
    stages?.filter((s) => s.systemState === 'active').reduce((sum, s) => sum + s.count, 0) ?? 0;
  const overdue = stages?.reduce((sum, s) => sum + s.overdueCount, 0) ?? 0;

  return (
    <div className="relative flex h-full flex-col">
      <header className="flex items-end justify-between px-6 pt-5 pb-3">
        <h1 className="text-xl font-semibold text-foreground">{ui.tasks.title}</h1>
        <div className="flex items-center gap-2">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase select-none">
            {ui.tasks.summaryActive} <span className="text-foreground tabular-nums">{active}</span>
            <span className="mx-2 text-border">·</span>
            {ui.tasks.summaryOverdue}{' '}
            <span className={cn('tabular-nums', overdue > 0 ? 'text-danger' : 'text-foreground')}>
              {overdue}
            </span>
          </p>
          <ViewSettings
            viewKey={view === 'list' ? 'tasks.list' : 'tasks.kanban'}
            defs={view === 'list' ? taskListFields : taskCardFields}
          />
        </div>
      </header>
      <div className="min-h-0 flex-1">{view === 'list' ? <TaskList /> : <TaskKanban />}</div>
      <Outlet />
    </div>
  );
}
