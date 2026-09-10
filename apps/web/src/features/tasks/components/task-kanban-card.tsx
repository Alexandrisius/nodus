import { useNavigate } from '@tanstack/react-router';
import type { TaskListItem } from '@nodus/contracts';

import { useShellStore } from '../../../app/shell/shell-store.js';
import { BoardTaskCard } from '../../../shared/ui/board/board-task-card.js';
import { usePrefetchTask } from '../api/tasks-api.js';

/** Карточка канбана «Мой план»: общая презентационная BoardTaskCard +
 *  доменное открытие — слайдер задачи с shared-element раскрытием из rect
 *  карточки (lastSource) и префетч детали/обсуждения по ховеру. */
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
  const navigate = useNavigate();
  const setLastSource = useShellStore((s) => s.setLastSource);
  const prefetch = usePrefetchTask();

  return (
    <BoardTaskCard
      task={task}
      parentNumber={parentNumber}
      isVisible={isVisible}
      overlay={overlay}
      placeholder={placeholder}
      onHover={(t) => prefetch(t.id)}
      onOpen={(t, rect) => {
        setLastSource({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
        void navigate({ to: '/tasks/$taskId', params: { taskId: t.id } });
      }}
    />
  );
}
