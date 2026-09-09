import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import type { TaskListItem } from '@nodus/contracts';

import { Skeleton } from '@nodus/ui/components/skeleton';

import { useViewFields } from '../../../shared/views/use-view-fields.js';
import { useTaskStages, useTasksList, useUpdateTaskStage } from '../api/tasks-api.js';
import { taskCardFields } from '../lib/task-fields.js';
import { TaskKanbanCard } from './task-kanban-card.js';
import { TaskKanbanColumn } from './task-kanban-column.js';
import { TaskKanbanDraggable } from './task-kanban-draggable.js';

/** Канбан «Мой план»: колонки = стадии статус-схемы из каталога (I15, пустые
 * колонки видимы и принимают перенос); карточки — node-панели с настраиваемыми
 * полями (шестерёнка вида в шапке страницы). Перенос карточки между стадиями —
 * dnd-kit (ADR-0007): призрак DragOverlay, оптимистичная мутация стадии (I4)
 * с откатом и тостом при ошибке сервера; Esc отменяет перенос. */
export function TaskKanban() {
  const { data, isLoading } = useTasksList();
  const { data: stages } = useTaskStages();
  const updateStage = useUpdateTaskStage();
  const { isVisible } = useViewFields('tasks.kanban', taskCardFields);
  const [activeTask, setActiveTask] = useState<TaskListItem | null>(null);

  const sensors = useSensors(
    // distance: клик без движения — не drag, а открытие слайдера.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const items = data?.items ?? [];
  const stageList = useMemo(() => [...(stages ?? [])].sort((a, b) => a.order - b.order), [stages]);
  const numberById = useMemo(() => new Map(items.map((t) => [t.id, t.number] as const)), [items]);

  const onDragStart = (event: DragStartEvent) => {
    setActiveTask(items.find((t) => t.id === event.active.id) ?? null);
  };
  const onDragEnd = (event: DragEndEvent) => {
    const task = activeTask;
    setActiveTask(null);
    const overId = event.over?.id;
    if (!task || overId === undefined || overId === task.stage.id) return;
    updateStage.mutate({ taskId: task.id, stageId: String(overId) });
  };

  if (isLoading || !stages) {
    return (
      <div className="flex h-full gap-4 overflow-x-auto p-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-full w-72 shrink-0" />
        ))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveTask(null)}
    >
      <div className="flex h-full gap-5 overflow-x-auto px-6 pt-1 pb-4">
        {stageList.map((stage) => {
          const cards = items.filter((t) => t.stage.id === stage.id);
          return (
            <TaskKanbanColumn key={stage.id} stage={stage} count={cards.length}>
              {cards.map((task) => (
                <TaskKanbanDraggable
                  key={task.id}
                  task={task}
                  parentNumber={task.parentId ? numberById.get(task.parentId) : undefined}
                  isVisible={isVisible}
                />
              ))}
            </TaskKanbanColumn>
          );
        })}
      </div>
      <DragOverlay>
        {activeTask ? <TaskKanbanCard task={activeTask} isVisible={isVisible} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}
