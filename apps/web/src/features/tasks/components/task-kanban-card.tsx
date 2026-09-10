import type { TaskListItem } from '@nodus/contracts';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { BoardTaskCard } from '../../../shared/ui/board/board-task-card.js';
import { usePrefetchTask } from '../api/tasks-api.js';

/** Карточка канбана «Мой план»: общая презентационная BoardTaskCard +
 *  доменное открытие — карточка задачи в стеке (shared-element раскрытие из
 *  rect карточки) и префетч детали/обсуждения по ховеру. */
export function TaskKanbanCard({
  task,
  parentNumber,
  isVisible,
  overlay = false,
  placeholder = false,
}: {
  task: TaskListItem;
  parentNumber?: number;
  isVisible: (fieldId: string) => boolean;
  overlay?: boolean;
  placeholder?: boolean;
}) {
  const openCard = useOpenCard();
  const prefetch = usePrefetchTask();

  return (
    <BoardTaskCard
      task={task}
      parentNumber={parentNumber}
      isVisible={isVisible}
      overlay={overlay}
      placeholder={placeholder}
      onHover={(t) => prefetch(t.id)}
      onOpen={(t, rect) => openCard({ kind: 'task', id: t.id }, rect)}
    />
  );
}
