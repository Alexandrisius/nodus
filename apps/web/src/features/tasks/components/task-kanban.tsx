import { useMemo } from 'react';
import type { TaskListItem, TaskStage } from '@nodus/contracts';

import { Skeleton } from '@nodus/ui/components/skeleton';
import { cn } from '@nodus/ui/lib/utils';

import { useTasksList } from '../api/tasks-api.js';
import { TaskKanbanCard } from './task-kanban-card.js';
import { stageColumnTone } from './task-status-badge.js';

/** Канбан «Мой план»: колонки = стадии статус-схемы из данных (I15). */
export function TaskKanban({ items }: { items?: TaskListItem[] }) {
  const { data, isLoading } = useTasksList();
  const listItems = items ?? data?.items ?? [];
  const loading = items ? false : isLoading;

  const stages = useMemo(() => {
    const byId = new Map<string, TaskStage>();
    for (const task of listItems) byId.set(task.stage.id, task.stage);
    return [...byId.values()].sort((a, b) => a.order - b.order);
  }, [listItems]);

  if (loading) {
    return (
      <div className="flex h-full gap-3 overflow-x-auto p-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-full w-72 shrink-0" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full gap-3 overflow-x-auto p-4">
      {stages.map((stage) => {
        const cards = listItems.filter((t) => t.stage.id === stage.id);
        return (
          <section key={stage.id} className="flex h-full w-72 shrink-0 flex-col">
            <header
              className={cn(
                'crayon-fill mb-2 flex h-8 items-center justify-between rounded-lg px-3 text-sm font-semibold',
                stageColumnTone(stage.order),
              )}
            >
              {stage.name}
              <span className="text-xs font-normal opacity-70 tabular-nums">{cards.length}</span>
            </header>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden px-1 pb-2">
              {cards.map((task) => (
                <TaskKanbanCard key={task.id} task={task} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
