import { useEffect, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { TaskListItem } from '@nodus/contracts';

import { cn } from '@nodus/ui/lib/utils';

import { TaskKanbanCard } from './task-kanban-card.js';

/** Карточка смонтирована хотя бы один кадр (официальный useMountStatus):
 * перемонтированная в чужую колонку ВО ВРЕМЯ drag карточка не должна стартовать
 * транзишен с неверных координат — первый кадр без transition. */
function useMountStatus(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return mounted;
}

/**
 * Sortable-карточка канбана (ADR-0007): useSortable даёт живую сортировку
 * (трансформы уступания места соседями), призрак рисует DragOverlay.
 * Трансформ sortable — всегда (и у активного): он двигает полупрозрачный слот
 * к проекционной позиции; без него слот стоит и налезает на соседей.
 * Сенсоры на активаторе: клик без движения — открытие слайдера
 * (distance-констрейнт PointerSensor).
 */
export function TaskKanbanSortableCard({
  task,
  parentNumber,
  isVisible,
}: {
  task: TaskListItem;
  parentNumber?: number;
  isVisible: (fieldId: string) => boolean;
}) {
  const {
    setNodeRef,
    setActivatorNodeRef,
    listeners,
    attributes,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, data: { stageId: task.stage.id } });
  const mounted = useMountStatus();
  const mountedWhileDragging = isDragging && !mounted;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: mountedWhileDragging ? undefined : transition,
      }}
    >
      <div
        ref={setActivatorNodeRef}
        className={cn('cursor-grab', isDragging && 'opacity-40')}
        {...listeners}
        {...attributes}
      >
        <TaskKanbanCard
          task={task}
          parentNumber={parentNumber}
          isVisible={isVisible}
          placeholder={isDragging}
        />
      </div>
    </div>
  );
}
