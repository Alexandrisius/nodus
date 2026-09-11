import { useMemo } from 'react';
import { useSearch } from '@tanstack/react-router';
import type { TaskListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { ListToolbar } from '../../../shared/views/list-toolbar.js';
import type { ActiveListFilter } from '../../../shared/views/list-filters.js';
import { useListToolbar } from '../../../shared/views/use-list-toolbar.js';
import { ViewSettings } from '../../../shared/views/view-settings.js';
import { useTaskStages } from '../../../shared/api/task-stages.js';
import { makeTaskCardFields } from '../../../shared/views/task-card-fields.js';
import { taskSearchText, useTaskFilterDefs } from '../../../shared/views/task-filter-fields.js';
import { taskListFields } from '../lib/task-fields.js';
import { TaskKanban } from '../components/task-kanban.js';
import { TaskList } from '../components/task-list.js';

/** Реестр блоков карточки канбана — module-константа (стабильная идентичность). */
const taskCardFields = makeTaskCardFields();

/** Задачи: виды «Мой план» (канбан) и «Список» — переключаются в топбаре.
 *  Шапка — живая сводка из счётчиков каталога стадий. Строка инструментов —
 *  единый стандарт: локальный поиск по списку, фильтр по атрибутам с
 *  пресетами, шестерёнка отображаемых полей активного вида (память по
 *  viewKey вида; ширина колонок — ручкой в хедере таблицы). */
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
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase select-none">
          {ui.tasks.summaryActive} <span className="text-foreground tabular-nums">{active}</span>
          <span className="mx-2 text-border">·</span>
          {ui.tasks.summaryOverdue}{' '}
          <span className={cn('tabular-nums', overdue > 0 ? 'text-danger' : 'text-foreground')}>
            {overdue}
          </span>
        </p>
      </header>
      {/* key по виду: у каждого представления — своя память фильтров (viewKey) */}
      <TasksToolbar key={view} view={view} />
    </div>
  );
}

/** Строка инструментов + активный вид: фильтр собирается здесь и уходит
 *  пропом в список/канбан (единый стандарт, «модули не отличаются»). */
function TasksToolbar({ view }: { view: 'list' | 'kanban' }) {
  const viewKey = view === 'list' ? 'tasks.list' : 'tasks.kanban';
  const toolbar = useListToolbar(viewKey);
  const defs = useTaskFilterDefs({ projectVisible: true });
  const filter = useMemo<ActiveListFilter<TaskListItem>>(
    () => ({ defs, state: toolbar.filters, query: toolbar.query, searchText: taskSearchText }),
    [defs, toolbar.filters, toolbar.query],
  );

  return (
    <>
      <ListToolbar
        toolbar={toolbar}
        defs={defs}
        searchPlaceholder={ui.tasks.searchInList}
        right={
          <ViewSettings
            viewKey={viewKey}
            defs={view === 'list' ? taskListFields : taskCardFields}
          />
        }
      />
      <div className="min-h-0 flex-1">
        {view === 'list' ? <TaskList filter={filter} /> : <TaskKanban filter={filter} />}
      </div>
    </>
  );
}
