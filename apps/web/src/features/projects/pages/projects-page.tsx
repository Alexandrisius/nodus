import { useMemo } from 'react';
import { Link2, Plus, SquareArrowOutUpRight } from 'lucide-react';
import type { ProjectListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { copyCardLink } from '../../../shared/lib/card-link.js';
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
import { ViewSettings } from '../../../shared/views/view-settings.js';
import { useProjectsList } from '../api/projects-api.js';

/**
 * Проекты: журнал канонической таблицей (shared/views, ключ `projects.list`) —
 * колонки-реестр, видимость шестерёнкой, ширина ручкой, память между сессиями.
 * Шапка — ОДНА строка (вердикт владельца): заголовок, счётчик, строка
 * инструментов (поиск с панелью фильтра из строки — модель Битрикс24:
 * пресеты «Я — руководитель»/«Открытые»/«Закрытые» + поля: приватность,
 * моя роль, руководитель, окончание), шестерёнка представления. Открытие —
 * карточка проекта в стеке (shared-element раскрытие из rect строки).
 */
export function ProjectsPage() {
  const { data, isLoading } = useProjectsList();
  const openCard = useOpenCard();
  const toolbar = useListToolbar('projects.list', projectBuiltinPresets);
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

  function openProject(project: ProjectListItem, rowEl: HTMLElement) {
    openCard({ kind: 'project', id: project.id }, rowEl.getBoundingClientRect());
  }

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-3 px-6">
        <h1 className="shrink-0 text-xl font-semibold text-foreground">
          {ui.projects.title}
          <span className="ml-2 align-middle font-mono text-sm font-normal text-muted-foreground tabular-nums">
            {items.length}
          </span>
        </h1>
        <ListToolbar
          className="min-w-0 flex-1 px-0"
          toolbar={toolbar}
          defs={filterDefs}
          builtinPresets={projectBuiltinPresets}
          left={
            // Вердикт владельца 15.09.2026: кнопку показать БЕЗ ДЕЙСТВИЯ —
            // окна создания проекта пока нет (экспресс-форма проекту не
            // нужна; появится окно — поведение подключим тем же паттерном,
            // что задача).
            <Button type="button">
              <Plus data-icon="inline-start" />
              {ui.common.create}
            </Button>
          }
          right={<ViewSettings viewKey="projects.list" defs={projectListFields} />}
        />
      </div>
      <div className="min-h-0 flex-1">
        <DataTable
          viewKey="projects.list"
          defs={projectListFields}
          rows={rows}
          rowKey={(project) => project.id}
          isLoading={isLoading}
          onOpenRow={openProject}
          rowMenu={(project) => [
            {
              id: 'open',
              icon: <SquareArrowOutUpRight className="size-3.5" />,
              label: ui.common.open,
              onSelect: () => openCard({ kind: 'project', id: project.id }),
            },
            {
              id: 'copy',
              icon: <Link2 className="size-3.5" />,
              label: ui.common.copyLink,
              onSelect: () => void copyCardLink({ kind: 'project', id: project.id }),
            },
          ]}
        />
      </div>
    </div>
  );
}
