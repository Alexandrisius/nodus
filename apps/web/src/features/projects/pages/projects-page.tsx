import { Outlet, useNavigate } from '@tanstack/react-router';
import type { ProjectListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { useShellStore } from '../../../app/shell/shell-store.js';
import { plural } from '../../../shared/lib/format.js';
import { DataTable } from '../../../shared/views/data-table.js';
import { ViewSettings } from '../../../shared/views/view-settings.js';
import { useProjectsList } from '../api/projects-api.js';
import { projectListFields } from '../lib/project-fields.js';

/**
 * Проекты: журнал канонической таблицей (shared/views, ключ `projects.list`) —
 * колонки-реестр `lib/project-fields.tsx`, видимость шестерёнкой, ширина
 * ручкой, память между сессиями. Шапка — живая сводка и шестерёнка
 * представления. Открытие — слайдер с shared-element раскрытием из rect
 * строки. Создание проекта — форма после MVP (мёртвых кнопок-обрубков нет).
 */
export function ProjectsPage() {
  const { data, isLoading } = useProjectsList();
  const navigate = useNavigate();
  const setLastSource = useShellStore((s) => s.setLastSource);

  const items = data?.items ?? [];
  const managing = items.filter((p) => p.myRole === 'manager').length;

  function openProject(project: ProjectListItem, rowEl: HTMLElement) {
    const rect = rowEl.getBoundingClientRect();
    setLastSource({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    void navigate({ to: '/projects/$projectId', params: { projectId: project.id } });
  }

  return (
    <div className="relative flex h-full flex-col">
      <header className="flex items-end justify-between px-6 pt-5 pb-3">
        <h1 className="text-xl font-semibold text-foreground">{ui.projects.title}</h1>
        <div className="flex items-center gap-2">
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
          <ViewSettings viewKey="projects.list" defs={projectListFields} />
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <DataTable
          viewKey="projects.list"
          defs={projectListFields}
          rows={items}
          rowKey={(project) => project.id}
          isLoading={isLoading}
          onOpenRow={openProject}
        />
      </div>
      <Outlet />
    </div>
  );
}
