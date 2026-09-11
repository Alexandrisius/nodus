import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { DataTable } from '../../../shared/views/data-table.js';
import { makeTaskTableFields } from '../../../shared/views/task-table-fields.js';
import { useProjectTaskPages } from '../api/projects-api.js';

/** Реестр — module-константа (стабильная идентичность для useViewFields);
 *  «Проект» по умолчанию скрыт: список открыт в контексте проекта. */
export const projectTaskTableFields = makeTaskTableFields({ projectVisible: false });

/** Вид «Список» карточки проекта: те же задачи (фильтр projectId, плейбук
 *  §3.3) канонической таблицей на общей машине shared/views — свой ключ
 *  вида `projects.tasks` (отдельная память колонок от журнала задач).
 *  Открытие — карточка задачи ПОВЕРХ карточки проекта (стек, ADR-0009). */
export function ProjectTaskList({ projectId }: { projectId: string }) {
  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useProjectTaskPages(projectId);
  const openCard = useOpenCard();

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <DataTable
      viewKey="projects.tasks"
      defs={projectTaskTableFields}
      rows={items}
      rowKey={(task) => task.id}
      isLoading={isLoading}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      onLoadMore={() => void fetchNextPage()}
      onOpenRow={(task, rowEl) =>
        openCard({ kind: 'task', id: task.id }, rowEl.getBoundingClientRect())
      }
    />
  );
}
