import type { ProjectListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { plural } from '../../../shared/lib/format.js';
import { DataTable } from '../../../shared/views/data-table.js';
import { ListToolbar } from '../../../shared/views/list-toolbar.js';
import type { ActiveListFilter } from '../../../shared/views/list-filters.js';
import { useFilteredList, useListToolbar } from '../../../shared/views/use-list-toolbar.js';
import {
  projectSearchText,
  useProjectFilterDefs,
} from '../../../shared/views/project-filter-fields.js';
import { projectListFields } from '../../../shared/views/project-table-fields.js';
import { ViewSettings } from '../../../shared/views/view-settings.js';
import { useProjectsList } from '../api/projects-api.js';
import { useMemo } from 'react';

/**
 * Проекты: журнал канонической таблицей (shared/views, ключ `projects.list`) —
 * колонки-реестр, видимость шестерёнкой, ширина ручкой, память между сессиями.
 * Строка инструментов — единый стандарт: локальный поиск по проектам, фильтр
 * по атрибутам (приватность, моя роль, руководитель, окончание) с пресетами,
 * шестерёнка представления. Открытие — карточка проекта в стеке
 * (shared-element раскрытие из rect строки).
 */
export function ProjectsPage() {
  const { data, isLoading } = useProjectsList();
  const openCard = useOpenCard();
  const toolbar = useListToolbar('projects.list');
  const filterDefs = useProjectFilterDefs();
  const filter = useMemo<ActiveListFilter<ProjectListItem>>(
    () => ({
      defs: filterDefs,
      state: toolbar.filters,
      query: toolbar.query,
      searchText: projectSearchText,
    }),
    [filterDefs, toolbar.filters, toolbar.query],
  );

  const items = data?.items ?? [];
  const rows = useFilteredList(items, filter);
  const managing = items.filter((p) => p.myRole === 'manager').length;

  function openProject(project: ProjectListItem, rowEl: HTMLElement) {
    openCard({ kind: 'project', id: project.id }, rowEl.getBoundingClientRect());
  }

  return (
    <div className="relative flex h-full flex-col">
      <header className="flex items-end justify-between px-6 pt-5 pb-3">
        <h1 className="text-xl font-semibold text-foreground">{ui.projects.title}</h1>
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase select-none">
          <span className="text-foreground tabular-nums">{items.length}</span>{' '}
          {plural(items.length, [
            ui.projects.countOne,
            ui.projects.countFew,
            ui.projects.countMany,
          ])}
          <span className="mx-2 text-border">·</span>
          {ui.projects.myRole.manager}:{' '}
          <span className="text-foreground tabular-nums">{managing}</span>
        </p>
      </header>
      <ListToolbar
        toolbar={toolbar}
        defs={filterDefs}
        searchPlaceholder={ui.projects.searchInList}
        right={<ViewSettings viewKey="projects.list" defs={projectListFields} />}
      />
      <div className="min-h-0 flex-1">
        <DataTable
          viewKey="projects.list"
          defs={projectListFields}
          rows={rows}
          rowKey={(project) => project.id}
          isLoading={isLoading}
          onOpenRow={openProject}
        />
      </div>
    </div>
  );
}
