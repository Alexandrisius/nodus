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
import {
  taskBuiltinPresets,
  taskSearchText,
  useTaskFilterDefs,
} from '../../../shared/views/task-filter-fields.js';
import { taskListFields } from '../lib/task-fields.js';
import { TaskKanban } from '../components/task-kanban.js';
import { TaskList } from '../components/task-list.js';

/** Реестр блоков карточки канбана — module-константа (стабильная идентичность). */
const taskCardFields = makeTaskCardFields();

/** Задачи: виды «Мой план» (канбан) и «Список» — переключаются в топбаре.
 *  Шапка — ОДНА строка (вердикт владельца: пустого места нет): заголовок,
 *  строка инструментов (поиск с панелью фильтра из строки — модель Битрикс24,
 *  пресеты со «скрепкой»), счётчик «Просрочено» (клик — фильтр просроченных,
 *  модель Битрикс24) и шестерёнка активного вида. Память фильтров — своя на
 *  вид (viewKey); ширина колонок — ручкой в хедере таблицы. */
export function TasksPage() {
  const search = useSearch({ strict: false }) as { view?: string };
  const view = search.view === 'list' ? 'list' : 'kanban';
  const { data: stages } = useTaskStages();
  const overdueTotal = stages?.reduce((sum, s) => sum + s.overdueCount, 0) ?? 0;

  return (
    <div className="relative flex h-full flex-col">
      {/* key по виду: у каждого представления — своя память фильтров (viewKey) */}
      <TasksSection key={view} view={view} overdueTotal={overdueTotal} />
    </div>
  );
}

function TasksSection({ view, overdueTotal }: { view: 'list' | 'kanban'; overdueTotal: number }) {
  const viewKey = view === 'list' ? 'tasks.list' : 'tasks.kanban';
  const toolbar = useListToolbar(viewKey, taskBuiltinPresets);
  const defs = useTaskFilterDefs({ projectVisible: true });
  const filter = useMemo<ActiveListFilter<TaskListItem>>(
    () => ({ defs, state: toolbar.filters, query: toolbar.query, searchText: taskSearchText }),
    [defs, toolbar.filters, toolbar.query],
  );
  const overdueActive = toolbar.filters.overdue === 'yes';

  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-6">
        <h1 className="shrink-0 text-xl font-semibold text-foreground">{ui.tasks.title}</h1>
        <ListToolbar
          className="min-w-0 flex-1 px-0"
          toolbar={toolbar}
          defs={defs}
          builtinPresets={taskBuiltinPresets}
          right={
            <>
              {overdueTotal > 0 ? (
                <button
                  type="button"
                  onClick={() => toolbar.setFilter('overdue', overdueActive ? undefined : 'yes')}
                  aria-pressed={overdueActive}
                  title={ui.tasks.showOverdue}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px] tracking-[0.12em] uppercase transition-colors',
                    overdueActive
                      ? 'bg-danger/15 text-danger'
                      : 'text-danger/80 hover:bg-danger/10',
                  )}
                >
                  <span className="font-semibold tabular-nums">{overdueTotal}</span>
                  {ui.tasks.summaryOverdue}
                </button>
              ) : null}
              <ViewSettings
                viewKey={viewKey}
                defs={view === 'list' ? taskListFields : taskCardFields}
              />
            </>
          }
        />
      </div>
      <div className="min-h-0 flex-1">
        {view === 'list' ? <TaskList filter={filter} /> : <TaskKanban filter={filter} />}
      </div>
    </>
  );
}
