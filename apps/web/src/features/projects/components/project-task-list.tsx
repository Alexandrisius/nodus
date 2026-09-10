import { useNavigate } from '@tanstack/react-router';

import { useShellStore } from '../../../app/shell/shell-store.js';
import { DataTable } from '../../../shared/views/data-table.js';
import { useProjectTaskPages } from '../api/projects-api.js';
import { projectTaskListFields } from '../lib/project-task-fields.js';

/** Вид «Список» панели проекта: те же задачи (фильтр projectId, плейбук
 *  §3.3) канонической таблицей на общей машине shared/views — свой ключ
 *  вида `projects.tasks` (отдельная память колонок от журнала задач).
 *  Открытие — универсальная карточка задачи уровнем 2 поверх проекта. */
export function ProjectTaskList({ projectId }: { projectId: string }) {
  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useProjectTaskPages(projectId);
  const navigate = useNavigate();
  const setLastSource = useShellStore((s) => s.setLastSource);

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <DataTable
      viewKey="projects.tasks"
      defs={projectTaskListFields}
      rows={items}
      rowKey={(task) => task.id}
      isLoading={isLoading}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      onLoadMore={() => void fetchNextPage()}
      onOpenRow={(task, rowEl) => {
        const rect = rowEl.getBoundingClientRect();
        setLastSource({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
        void navigate({
          to: '/projects/$projectId/task/$taskId',
          params: { projectId, taskId: task.id },
        });
      }}
    />
  );
}
