import { useMemo } from 'react';
import type { ProjectListItem, TaskListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { DataTable } from '../../../shared/views/data-table.js';
import { ListToolbar } from '../../../shared/views/list-toolbar.js';
import type { ActiveListFilter } from '../../../shared/views/list-filters.js';
import { useFilteredList, useListToolbar } from '../../../shared/views/use-list-toolbar.js';
import {
  projectBuiltinPresets,
  projectSearchText,
  useProjectFilterDefs,
} from '../../../shared/views/project-filter-fields.js';
import { projectListFields } from '../../../shared/views/project-table-fields.js';
import {
  taskBuiltinPresets,
  taskSearchText,
  useTaskFilterDefs,
} from '../../../shared/views/task-filter-fields.js';
import { makeTaskTableFields } from '../../../shared/views/task-table-fields.js';
import { ViewSettings } from '../../../shared/views/view-settings.js';

/** Реестры таблиц — module-константы (стабильная идентичность useViewFields). */
const employeeTaskTableFields = makeTaskTableFields();

/**
 * Вкладки «Задачи»/«Проекты» карточки сотрудника — ПОЛНОЦЕННЫЕ журналы по
 * единому стандарту («модули не отличаются»): строка инструментов (локальный
 * поиск + фильтр с пресетами + шестерёнка полей) над канонической таблицей.
 * Фильтр «Ответственный» скрыт — список и так по сотруднику.
 */
export function EmployeeTasksTab({
  tasks,
  isLoading,
}: {
  tasks: TaskListItem[];
  isLoading: boolean;
}) {
  const openCard = useOpenCard();
  const toolbar = useListToolbar('directory.tasks', taskBuiltinPresets);
  const defs = useTaskFilterDefs({ projectVisible: true, assigneeVisible: false });
  const filter = useMemo<ActiveListFilter<TaskListItem>>(
    () => ({ defs, state: toolbar.filters, query: toolbar.query, searchText: taskSearchText }),
    [defs, toolbar.filters, toolbar.query],
  );
  const rows = useFilteredList(tasks, filter);

  return (
    <div className="flex h-full flex-col">
      {/* БЕЗ border-b (канон раунда 6 + вердикт владельца 12.09.2026): линия
          под тулбаром читалась «полоской под поиском» — сегмент справа от
          поля, сжимающегося после закрытия панели фильтра. Журналы и
          вкладки-списки карточек выглядят ОДИНАКОВО. */}
      <ListToolbar
        toolbar={toolbar}
        defs={defs}
        builtinPresets={taskBuiltinPresets}
        right={<ViewSettings viewKey="directory.tasks" defs={employeeTaskTableFields} />}
      />
      <div className="min-h-0 flex-1">
        <DataTable
          viewKey="directory.tasks"
          defs={employeeTaskTableFields}
          rows={rows}
          rowKey={(task) => task.id}
          isLoading={isLoading}
          emptyTitle={ui.employees.noTasks}
          onOpenRow={(task, rowEl) =>
            openCard({ kind: 'task', id: task.id }, rowEl.getBoundingClientRect())
          }
        />
      </div>
    </div>
  );
}

export function EmployeeProjectsTab({
  projects,
  isLoading,
}: {
  projects: ProjectListItem[];
  isLoading: boolean;
}) {
  const openCard = useOpenCard();
  const toolbar = useListToolbar('directory.projects', projectBuiltinPresets);
  const defs = useProjectFilterDefs();
  const filter = useMemo<ActiveListFilter<ProjectListItem>>(
    () => ({ defs, state: toolbar.filters, query: toolbar.query, searchText: projectSearchText }),
    [defs, toolbar.filters, toolbar.query],
  );
  const rows = useFilteredList(projects, filter);

  return (
    <div className="flex h-full flex-col">
      {/* БЕЗ border-b — канон единой строки инструментов (см. задачи выше). */}
      <ListToolbar
        toolbar={toolbar}
        defs={defs}
        builtinPresets={projectBuiltinPresets}
        right={<ViewSettings viewKey="directory.projects" defs={projectListFields} />}
      />
      <div className="min-h-0 flex-1">
        <DataTable
          viewKey="directory.projects"
          defs={projectListFields}
          rows={rows}
          rowKey={(project) => project.id}
          isLoading={isLoading}
          emptyTitle={ui.employees.noProjects}
          onOpenRow={(project, rowEl) =>
            openCard({ kind: 'project', id: project.id }, rowEl.getBoundingClientRect())
          }
        />
      </div>
    </div>
  );
}
