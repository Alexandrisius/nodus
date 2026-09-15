import { DndContext, DragOverlay } from '@dnd-kit/core';
import type { TaskListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { tasksKeys } from '../../../shared/api/tasks-keys.js';
import { useTaskStages } from '../../../shared/api/task-stages.js';
import { globalAxis } from '../../../shared/lib/board/kanban-board.js';
import { BoardColumn } from '../../../shared/ui/board/board-column.js';
import { BoardSortableCard } from '../../../shared/ui/board/board-sortable-card.js';
import { BoardTaskCard } from '../../../shared/ui/board/board-task-card.js';
import { KanbanSkeleton } from '../../../shared/ui/board/kanban-skeleton.js';
import { KANBAN_FEED_LIMIT, useKanbanBoard } from '../../../shared/ui/board/use-kanban-board.js';
import { isFilteringActive, type ActiveListFilter } from '../../../shared/views/list-filters.js';
import { makeTaskCardFields } from '../../../shared/views/task-card-fields.js';
import { useFilteredList } from '../../../shared/views/use-list-toolbar.js';
import { useViewFields } from '../../../shared/views/use-view-fields.js';
import { useCreateProjectTask, useMoveProjectTask } from '../api/projects-api.js';

/** Реестр — module-константа; «Проект» скрыт по умолчанию (контекст очевиден). */
export const projectKanbanCardFields = makeTaskCardFields({ projectVisible: false });

/**
 * Проектный канбан (плейбук §3.1): задачи проекта — ТЕ ЖЕ сущности
 * (фильтр projectId), колонки — стадии workflow-схемы проекта (глобальная
 * ось, ADR-0008; до редактора схем #38 — дефолтная схема). DnD — тот же
 * канон «Моего плана» (общий движок use-kanban-board, аудит #45), но БЕЗ
 * CRUD колонок: стадии проекта правятся в редакторе схем, меню и создание
 * стадий отключены. Quick-add задачи в колонку — POST /tasks {title, stageId,
 * projectId}. Открытие карточки — карточка задачи ПОВЕРХ карточки проекта
 * (стек, ADR-0009, shared-element из rect карточки).
 */
export function ProjectKanban({
  projectId,
  filter,
}: {
  projectId: string;
  filter?: ActiveListFilter<TaskListItem>;
}) {
  const { data: stages } = useTaskStages();
  const move = useMoveProjectTask();
  const create = useCreateProjectTask(projectId);
  const { isVisible } = useViewFields('projects.kanban', projectKanbanCardFields);
  const openCard = useOpenCard();

  const board = useKanbanBoard({
    axis: globalAxis,
    stages,
    queryKey: tasksKeys.kanban(`project:${projectId}`),
    feedUrl: (stageId, cursor) =>
      `/tasks?stageId=${stageId}&projectId=${projectId}&limit=${KANBAN_FEED_LIMIT}${cursor ? `&cursor=${cursor}` : ''}`,
    onMove: (vars, opts) =>
      move.mutate(
        { taskId: vars.taskId, stageId: vars.stageId, index: vars.index },
        { onError: opts.onError },
      ),
  });

  // Локальный фильтр строки инструментов: сужает ТОЛЬКО отображение (DnD-логика
  // — по полному борду); при активном фильтре drag выключен, шапки — «n из m».
  const visibleItems = useFilteredList(board.items, filter);
  const filtering = isFilteringActive(filter);

  if (!board.ready) {
    return <KanbanSkeleton />;
  }

  return (
    <DndContext
      sensors={board.sensors}
      collisionDetection={board.collision}
      measuring={board.measuring}
      {...board.dndHandlers}
    >
      <div className="flex h-full gap-5 overflow-x-auto px-6 pt-3 pb-4">
        {board.stageList.map((stage) => {
          const totalCards = board.items.filter((t) => t.stage.id === stage.id).length;
          const cards = visibleItems.filter((t) => t.stage.id === stage.id);
          return (
            <BoardColumn
              key={stage.id}
              stage={stage}
              count={cards.length}
              total={filtering ? totalCards : undefined}
              cardIds={cards.map((t) => t.id)}
              hasNext={board.cursors[stage.id] !== null && board.cursors[stage.id] !== undefined}
              loadingMore={Boolean(board.loadingMore[stage.id])}
              onLoadMore={board.loadMore}
              emptyLabel={ui.tasks.emptyColumn}
              dropLabel={ui.tasks.dropHere}
              quickAdd={{
                placeholder: ui.tasks.quickTaskPlaceholder,
                addButtonLabel: ui.tasks.create,
                onCreate: (stageId, title) =>
                  create.mutate(
                    { title, stageId },
                    {
                      onSuccess: (task) => board.insertNewTask(stageId, task),
                    },
                  ),
              }}
            >
              {cards.map((task) => (
                <BoardSortableCard
                  key={task.id}
                  id={task.id}
                  stageId={task.stage.id}
                  disabled={filtering}
                >
                  {({ placeholder }) => (
                    <BoardTaskCard
                      task={task}
                      parentNumber={task.parentId ? board.numberById.get(task.parentId) : undefined}
                      isVisible={isVisible}
                      placeholder={placeholder}
                      onOpen={(t, rect) => openCard({ kind: 'task', id: t.id }, rect)}
                    />
                  )}
                </BoardSortableCard>
              ))}
            </BoardColumn>
          );
        })}
      </div>
      <DragOverlay>
        {board.activeTask ? (
          <BoardTaskCard
            task={board.activeTask}
            parentNumber={board.activeParent}
            isVisible={isVisible}
            overlay
            onOpen={() => {}}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
