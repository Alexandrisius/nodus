import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { Paginated, TaskListItem, TaskStage } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Skeleton } from '@nodus/ui/components/skeleton';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { api } from '../../../shared/api-client.js';
import { useTaskStages } from '../../../shared/api/task-stages.js';
import {
  indexOfInStage,
  isSamePlacement,
  moveTaskToStage,
  globalAxis,
  reorderWithinStage,
} from '../../../shared/lib/board/kanban-board.js';
import { makeKanbanCollision } from '../../../shared/lib/board/kanban-collision.js';
import { BoardColumn } from '../../../shared/ui/board/board-column.js';
import { BoardSortableCard } from '../../../shared/ui/board/board-sortable-card.js';
import { BoardTaskCard } from '../../../shared/ui/board/board-task-card.js';
import { isFilteringActive, type ActiveListFilter } from '../../../shared/views/list-filters.js';
import { useFilteredList } from '../../../shared/views/use-list-toolbar.js';
import { useViewFields } from '../../../shared/views/use-view-fields.js';
import { makeTaskCardFields } from '../../../shared/views/task-card-fields.js';
import { useCreateProjectTask, useMoveProjectTask } from '../api/projects-api.js';

/** Реестр — module-константа; «Проект» скрыт по умолчанию (контекст очевиден). */
export const projectKanbanCardFields = makeTaskCardFields({ projectVisible: false });

const FEED_LIMIT = 30;

/**
 * Проектный канбан (плейбук §3.1): задачи проекта — ТЕ ЖЕ сущности
 * (фильтр projectId), колонки — стадии workflow-схемы проекта (глобальная
 * ось, ADR-0008; до редактора схем #38 — дефолтная схема). DnD — тот же
 * канон «Моего плана» (живая сортировка, персист стадии+индекса PATCH,
 * оптимистично I4 с откатом снапшотом), но БЕЗ CRUD колонок: стадии проекта
 * правятся в редакторе схем, меню и создание стадий отключены. Quick-add
 * задачи в колонку — POST /tasks {title, stageId, projectId}.
 * Открытие карточки — карточка задачи ПОВЕРХ карточки проекта (стек,
 * ADR-0009, shared-element из rect карточки).
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

  const [board, setBoard] = useState<TaskListItem[] | null>(null);
  const [cursors, setCursors] = useState<Record<string, string | null>>({});
  const [loadingMore, setLoadingMore] = useState<Record<string, boolean>>({});
  const [activeTask, setActiveTask] = useState<TaskListItem | null>(null);
  const [activeParent, setActiveParent] = useState<number | undefined>(undefined);
  const snapshotRef = useRef<TaskListItem[] | null>(null);
  const lastOverId = useRef<UniqueIdentifier | null>(null);
  const recentlyMoved = useRef(false);
  const cursorsRef = useRef<Record<string, string | null>>({});
  const loadingMoreRef = useRef<Record<string, boolean>>({});

  // Первые страницы колонок (филиал канонических фидов: колонки держат
  // тысячи карточек — целиком не грузим; дальше sentinel-подгрузка).
  useEffect(() => {
    if (!stages || board) return;
    let alive = true;
    void Promise.all(
      stages.map((s) =>
        api<Paginated<TaskListItem>>(
          `/tasks?stageId=${s.id}&projectId=${projectId}&limit=${FEED_LIMIT}`,
        ),
      ),
    ).then((pages) => {
      if (!alive) return;
      setBoard(pages.flatMap((p) => p.items));
      const cur = Object.fromEntries(stages.map((s, i) => [s.id, pages[i]?.nextCursor ?? null]));
      setCursors(cur);
      cursorsRef.current = cur;
    });
    return () => {
      alive = false;
    };
  }, [stages, board, projectId]);

  const loadMore = useCallback(
    (stageId: string) => {
      const cursor = cursorsRef.current[stageId];
      if (cursor === null || cursor === undefined || loadingMoreRef.current[stageId]) return;
      setLoadingMore((prev) => ({ ...prev, [stageId]: true }));
      loadingMoreRef.current = { ...loadingMoreRef.current, [stageId]: true };
      void api<Paginated<TaskListItem>>(
        `/tasks?stageId=${stageId}&projectId=${projectId}&limit=${FEED_LIMIT}&cursor=${cursor}`,
      ).then((page) => {
        setBoard((prev) => [...(prev ?? []), ...page.items]);
        setCursors((prev) => ({ ...prev, [stageId]: page.nextCursor }));
        cursorsRef.current = { ...cursorsRef.current, [stageId]: page.nextCursor };
        setLoadingMore((prev) => ({ ...prev, [stageId]: false }));
        loadingMoreRef.current = { ...loadingMoreRef.current, [stageId]: false };
      });
    },
    [projectId],
  );

  const sensors = useSensors(
    // distance: клик без движения — не drag, а открытие слайдера.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const items = board ?? [];
  // Локальный фильтр строки инструментов: сужает ТОЛЬКО отображение (DnD-логика
  // — по полному борду); при активном фильтре drag выключен, шапки — «n из m».
  const visibleItems = useFilteredList(items, filter);
  const filtering = isFilteringActive(filter);
  const stageList = useMemo(() => [...(stages ?? [])].sort((a, b) => a.order - b.order), [stages]);
  const stageById = useMemo(() => new Map(stageList.map((s) => [s.id, s] as const)), [stageList]);
  const numberById = useMemo(() => new Map(items.map((t) => [t.id, t.number] as const)), [items]);
  const childrenOf = useMemo(
    () => (columnId: string) =>
      items.filter((t) => globalAxis.keyOf(t) === columnId).map((t) => t.id),
    [items],
  );
  const collision = useMemo(
    () =>
      makeKanbanCollision({
        columnIds: () => stageList.map((s) => s.id),
        childrenOf,
        lastOverId,
        recentlyMoved,
      }),
    [stageList, childrenOf],
  );

  const stageOf = (id: UniqueIdentifier): TaskStage | undefined =>
    stageById.get(items.find((t) => t.id === id)?.stage.id ?? '');

  const onDragStart = (event: DragStartEvent) => {
    snapshotRef.current = items;
    const task = items.find((t) => t.id === event.active.id) ?? null;
    setActiveTask(task);
    setActiveParent(task?.parentId ? numberById.get(task.parentId) : undefined);
  };

  /** Живой переезд между колонками + предохранители цикла update depth
   * (анти-осциллятор и гейт isSamePlacement — механизмы в gotchas). */
  const onDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || recentlyMoved.current) return;
    const activeStage = stageOf(active.id);
    const overStage = stageById.get(String(over.id)) ?? stageOf(over.id);
    if (!activeStage || !overStage || activeStage.id === overStage.id) return;
    const overColumn = childrenOf(overStage.id);
    const overIndex = overColumn.indexOf(String(over.id));
    const below =
      active.rect.current.translated &&
      over.rect.top + over.rect.height / 2 < active.rect.current.translated.top;
    const index = overIndex >= 0 ? overIndex + (below ? 1 : 0) : overColumn.length;
    recentlyMoved.current = true;
    requestAnimationFrame(() => {
      recentlyMoved.current = false;
    });
    setBoard((prev) => {
      const next = moveTaskToStage(prev ?? [], String(active.id), overStage, index, globalAxis);
      return isSamePlacement(prev ?? [], next, globalAxis) ? (prev ?? []) : next;
    });
  };

  const onDragEnd = (event: DragEndEvent) => {
    const task = activeTask;
    setActiveTask(null);
    if (!task || !event.over) return;
    const overId = String(event.over.id);
    const settled =
      stageOf(overId)?.id === task.stage.id
        ? reorderWithinStage(items, task.id, overId, globalAxis)
        : items;
    setBoard(settled);
    const finalStage = stageById.get(settled.find((t) => t.id === task.id)?.stage.id ?? '');
    if (!finalStage) return;
    const index = indexOfInStage(settled, task.id, globalAxis);
    const snapshot = snapshotRef.current ?? [];
    const before = snapshot.find((t) => t.id === task.id);
    if (
      before?.stage.id === finalStage.id &&
      indexOfInStage(snapshot, task.id, globalAxis) === index
    ) {
      return;
    }
    move.mutate(
      { taskId: task.id, stageId: finalStage.id, index },
      {
        // Откат к снапшоту dragStart (I4: мутация до ответа сервера).
        onError: () => setBoard(snapshot),
      },
    );
  };

  const onDragCancel = () => {
    setActiveTask(null);
    if (snapshotRef.current) setBoard(snapshotRef.current);
  };

  if (!stages || !board) {
    return (
      <div className="flex h-full gap-5 overflow-x-auto px-6 pt-3 pb-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-full w-72 shrink-0" />
        ))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div className="flex h-full gap-5 overflow-x-auto px-6 pt-3 pb-4">
        {stageList.map((stage) => {
          const totalCards = items.filter((t) => t.stage.id === stage.id).length;
          const cards = visibleItems.filter((t) => t.stage.id === stage.id);
          return (
            <BoardColumn
              key={stage.id}
              stage={stage}
              count={cards.length}
              total={filtering ? totalCards : undefined}
              cardIds={cards.map((t) => t.id)}
              hasNext={cursors[stage.id] !== null && cursors[stage.id] !== undefined}
              loadingMore={Boolean(loadingMore[stage.id])}
              onLoadMore={loadMore}
              emptyLabel={ui.tasks.emptyColumn}
              dropLabel={ui.tasks.dropHere}
              quickAdd={{
                placeholder: ui.tasks.quickTaskPlaceholder,
                addButtonLabel: ui.tasks.create,
                onCreate: (stageId, title) =>
                  create.mutate(
                    { title, stageId },
                    {
                      // Новая задача — в топ колонки борда сразу (без refetch).
                      onSuccess: (task) => {
                        setBoard((prev) => {
                          const rest = prev ?? [];
                          const firstOfColumn = rest.find((t) => t.stage.id === stageId);
                          if (!firstOfColumn) return [...rest, task];
                          const at = rest.indexOf(firstOfColumn);
                          return [...rest.slice(0, at), task, ...rest.slice(at)];
                        });
                      },
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
                      parentNumber={task.parentId ? numberById.get(task.parentId) : undefined}
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
        {activeTask ? (
          <BoardTaskCard
            task={activeTask}
            parentNumber={activeParent}
            isVisible={isVisible}
            overlay
            onOpen={() => {}}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
