import { List, SquareKanban } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { TaskListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { ListToolbar } from '../../../shared/views/list-toolbar.js';
import type { ActiveListFilter } from '../../../shared/views/list-filters.js';
import { useListToolbar } from '../../../shared/views/use-list-toolbar.js';
import {
  taskBuiltinPresets,
  taskSearchText,
  useTaskFilterDefs,
} from '../../../shared/views/task-filter-fields.js';
import { ViewSettings } from '../../../shared/views/view-settings.js';
import { ProjectKanban, projectKanbanCardFields } from './project-kanban.js';
import { ProjectTaskList, projectTaskTableFields } from './project-task-list.js';

type TasksView = 'list' | 'kanban';

const tasksViews: { id: TasksView; label: string; icon: typeof List }[] = [
  { id: 'list', label: ui.projects.viewList, icon: List },
  { id: 'kanban', label: ui.projects.viewKanban, icon: SquareKanban },
];

/**
 * Вкладка «Задачи» карточки проекта: строка инструментов (единый стандарт)
 * — переключатель вида Список/Канбан, локальный поиск по задачам проекта,
 * фильтр по атрибутам с пресетами, шестерёнка отображаемых полей активного
 * вида. Органы управления — в ЗОНЕ ЗАДАЧ, не в таб-баре карточки (вердикт
 * владельца 2026-09-11); поле «Проект» фильтра скрыто (контекст очевиден).
 */
export function ProjectTasksTab({ projectId }: { projectId: string }) {
  const [view, setView] = useState<TasksView>('list');
  const toolbar = useListToolbar('projects.tasks', taskBuiltinPresets);
  const defs = useTaskFilterDefs({ projectVisible: false });
  const filter = useMemo<ActiveListFilter<TaskListItem>>(
    () => ({ defs, state: toolbar.filters, query: toolbar.query, searchText: taskSearchText }),
    [defs, toolbar.filters, toolbar.query],
  );

  return (
    <div className="flex h-full flex-col">
      {/* БЕЗ border-b (канон раунда 6 + вердикт владельца 12.09.2026): линия
          под тулбаром читалась «полоской под поиском»; вкладки-списки
          карточек и журналы — одинаково без неё. */}
      <ListToolbar
        toolbar={toolbar}
        defs={defs}
        builtinPresets={taskBuiltinPresets}
        left={
          <div className="flex items-center rounded-lg border border-border p-0.5">
            {tasksViews.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setView(v.id)}
                aria-pressed={view === v.id}
                title={v.label}
                aria-label={v.label}
                className={cn(
                  'flex size-6 items-center justify-center rounded-md transition-colors',
                  view === v.id
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground/80',
                )}
              >
                <v.icon className="size-3.5" strokeWidth={1.75} />
              </button>
            ))}
          </div>
        }
        right={
          <ViewSettings
            viewKey={view === 'list' ? 'projects.tasks' : 'projects.kanban'}
            defs={view === 'list' ? projectTaskTableFields : projectKanbanCardFields}
          />
        }
      />
      <div className="min-h-0 flex-1">
        {view === 'list' ? (
          <ProjectTaskList projectId={projectId} filter={filter} />
        ) : (
          <ProjectKanban projectId={projectId} filter={filter} />
        )}
      </div>
    </div>
  );
}
