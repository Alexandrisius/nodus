import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { TaskListItem } from '@nodus/contracts';

import { cn } from '@nodus/ui/lib/utils';

import { TaskKanbanCard } from './task-kanban-card.js';

/**
 * Sortable-карточка канбана (ADR-0007): useSortable даёт живую сортировку
 * (трансформы уступания места соседями), призрак рисует DragOverlay, поэтому
 * у активного элемента свой трансформ не применяется — он placeholder
 * (полупрозрачный, пунктир). Сенсоры на активаторе: клик без движения —
 * открытие слайдера (distance-констрейнт PointerSensor).
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

  return (
    <div
      ref={setNodeRef}
      // Трансформ — ВСЕГДА (и у активного элемента): у sortable он двигает
      // слот переносимой карточки к проекционной позиции при пересортировке;
      // без него полупрозрачный слот стоит на месте и налезает на соседей.
      style={{ transform: CSS.Transform.toString(transform), transition }}
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
