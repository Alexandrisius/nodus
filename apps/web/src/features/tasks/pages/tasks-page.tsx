import { useSearch } from '@tanstack/react-router';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { ViewSettings } from '../../../shared/views/view-settings.js';
import { useTaskStages } from '../../../shared/api/task-stages.js';
import { makeTaskCardFields } from '../../../shared/views/task-card-fields.js';
import { taskListFields } from '../lib/task-fields.js';
import { TaskKanban } from '../components/task-kanban.js';
import { TaskList } from '../components/task-list.js';

/** Реестр блоков карточки канбана — module-константа (стабильная идентичность). */
const taskCardFields = makeTaskCardFields();

/** Задачи: виды «Мой план» (канбан) и «Список» — переключаются в топбаре.
 * Шапка — живая сводка из счётчиков каталога стадий (в работе / просрочено;
 * totals в list-ответах запрещены каноном) и шестерёнка представления
 * (отображаемые поля активного вида; ширина колонок — ручкой в хедере
 * таблицы, с памятью между сессиями). */
export function TasksPage() {
  const search = useSearch({ strict: false }) as { view?: string };
  const view = search.view === 'list' ? 'list' : 'kanban';
  const { data: stages } = useTaskStages();

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
    </div>
  );
}
