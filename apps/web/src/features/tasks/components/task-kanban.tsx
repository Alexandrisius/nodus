import { useMemo } from 'react';
import type { TaskListItem, TaskStage } from '@nodus/contracts';

import { NodeLabel } from '@nodus/ui/components/node-label';
import { Skeleton } from '@nodus/ui/components/skeleton';

import { useTasksList } from '../api/tasks-api.js';
import { TaskKanbanCard } from './task-kanban-card.js';

/** Канбан «Мой план»: колонки = стадии статус-схемы из данных (I15);
 * плоские моно-шапки с портом, карточки — node-панели. */
export function TaskKanban({ items }: { items?: TaskListItem[] }) {
  const { data, isLoading } = useTasksList();
  const listItems = items ?? data?.items ?? [];
  const loading = items ? false : isLoading;

  const stages = useMemo(() => {
    const byId = new Map<string, TaskStage>();
    for (const task of listItems) byId.set(task.stage.id, task.stage);
    return [...byId.values()].sort((a, b) => a.order - b.order);
  }, [listItems]);

  const numberById = useMemo(
    () => new Map(listItems.map((t) => [t.id, t.number] as const)),
    [listItems],
  );

  if (loading) {
    return (
      <div className="flex h-full gap-4 overflow-x-auto p-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-full w-72 shrink-0" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full gap-5 overflow-x-auto px-6 pt-1 pb-4">
      {stages.map((stage) => {
        const cards = listItems.filter((t) => t.stage.id === stage.id);
        return (
          <section key={stage.id} className="flex h-full w-72 shrink-0 flex-col">
            <header className="flex items-center gap-2 border-b border-border px-1 pb-2">
              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-port" />
              <NodeLabel label={stage.name} count={cards.length} />
            </header>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-0.5 pt-3 pb-2">
              {cards.map((task) => (
                <TaskKanbanCard
                  key={task.id}
                  task={task}
                  parentNumber={task.parentId ? numberById.get(task.parentId) : undefined}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
