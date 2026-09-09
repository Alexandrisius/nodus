import { useDraggable } from '@dnd-kit/core';
import type { TaskListItem } from '@nodus/contracts';

import { cn } from '@nodus/ui/lib/utils';

import { TaskKanbanCard } from './task-kanban-card.js';

/**
 * Перетаскиваемая карточка канбана: сенсоры dnd-kit на обёртке (клик без
 * движения остаётся кликом — activationConstraint distance в сенсоре),
 * на месте переноса карточка полупрозрачна, призрак рисует DragOverlay.
 * Клавиатурный перенос — из коробки атрибутами dnd-kit (Space/стрелки/Esc).
 */
export function TaskKanbanDraggable({
  task,
  parentNumber,
  isVisible,
}: {
  task: TaskListItem;
  parentNumber?: number;
  isVisible: (fieldId: string) => boolean;
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: task.id,
    data: { stageId: task.stage.id },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn('cursor-grab', isDragging && 'opacity-40')}
      {...listeners}
      {...attributes}
    >
      <TaskKanbanCard task={task} parentNumber={parentNumber} isVisible={isVisible} />
    </div>
  );
}
