import { useEffect, useMemo, useRef, useState } from 'react';
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

import { Skeleton } from '@nodus/ui/components/skeleton';

import { api } from '../../../shared/api-client.js';
import { useViewFields } from '../../../shared/views/use-view-fields.js';
import { useTaskStages, useUpdateTaskStage } from '../api/tasks-api.js';
import {
  indexOfInStage,
  isSameOrder,
  moveTaskToStage,
  reorderWithinStage,
} from '../lib/kanban-board.js';
import { makeKanbanCollision } from '../lib/kanban-collision.js';
import { taskCardFields } from '../lib/task-fields.js';
import { TaskKanbanCard } from './task-kanban-card.js';
import { TaskKanbanColumn } from './task-kanban-column.js';
import { TaskKanbanSortableCard } from './task-kanban-sortable-card.js';

/** Канбан «Мой план» (ADR-0007): живая сортировка dnd-kit sortable — карточки
 * уступают место и переезжают между колонками ВО ВРЕМЯ переноса (onDragOver),
 * финализация — персист стадии+индекса (PATCH, оптимистично, I4); Esc — откат
 * к снапшоту dragStart. Призрак DragOverlay садится на живой слот (источник
 * уже в целевой колонке), поэтому «обратного перелёта» при дропе нет.
 * Борд — локальное состояние, синхронизированное с query вне переноса
 * (официальный паттерн dnd-kit + React Query). */
export function TaskKanban() {
  const { data: stages } = useTaskStages();
  const updateStage = useUpdateTaskStage();
  const { isVisible } = useViewFields('tasks.kanban', taskCardFields);

  const [board, setBoard] = useState<TaskListItem[] | null>(null);
  const [cursors, setCursors] = useState<Record<string, string | null>>({});
  const [loadingMore, setLoadingMore] = useState<Record<string, boolean>>({});
  const [countDelta, setCountDelta] = useState<Record<string, number>>({});
  const [activeTask, setActiveTask] = useState<TaskListItem | null>(null);
  const snapshotRef = useRef<TaskListItem[] | null>(null);
  const lastOverId = useRef<UniqueIdentifier | null>(null);
  const recentlyMoved = useRef(false);

  // Первые страницы колонок (industry: колонки держат тысячи карточек —
  // целиком не грузим; дальше sentinel-подгрузка в колонке, как в Битриксе).
  useEffect(() => {
    if (!stages || board) return;
    let alive = true;
    void Promise.all(
      stages.map((s) => api<Paginated<TaskListItem>>(`/tasks?stageId=${s.id}&limit=30`)),
    ).then((pages) => {
      if (!alive) return;
      setBoard(pages.flatMap((p) => p.items));
      setCursors(Object.fromEntries(stages.map((s, i) => [s.id, pages[i]?.nextCursor ?? null])));
    });
    return () => {
      alive = false;
    };
  }, [stages, board]);

  /** Подгрузка следующей страницы колонки (sentinel в скролл-контейнере). */
  function loadMore(stageId: string) {
    const cursor = cursors[stageId];
    if (cursor === null || cursor === undefined || loadingMore[stageId]) return;
    setLoadingMore((prev) => ({ ...prev, [stageId]: true }));
    void api<Paginated<TaskListItem>>(`/tasks?stageId=${stageId}&limit=30&cursor=${cursor}`).then(
      (page) => {
        setBoard((prev) => [...(prev ?? []), ...page.items]);
        setCursors((prev) => ({ ...prev, [stageId]: page.nextCursor }));
        setLoadingMore((prev) => ({ ...prev, [stageId]: false }));
      },
    );
  }

  const sensors = useSensors(
    // distance: клик без движения — не drag, а открытие слайдера.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const items = board ?? [];
  const stageList = useMemo(() => [...(stages ?? [])].sort((a, b) => a.order - b.order), [stages]);
  const stageById = useMemo(() => new Map(stageList.map((s) => [s.id, s] as const)), [stageList]);
  const numberById = useMemo(() => new Map(items.map((t) => [t.id, t.number] as const)), [items]);
  const childrenOf = useMemo(
    () => (columnId: string) => items.filter((t) => t.stage.id === columnId).map((t) => t.id),
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
    items.find((t) => t.id === id)?.stage;

  const onDragStart = (event: DragStartEvent) => {
    snapshotRef.current = items;
    setActiveTask(items.find((t) => t.id === event.active.id) ?? null);
  };

  /** Живой переезд между колонками: карточка встаёт в целевую колонку ещё
   * до дропа (индекс — от карточки под указателем, ниже/выше её центра).
   * Предохранители цикла update depth: (1) кадр после межколоночного переноса
   * игнорируем (анти-осциллятор на границе колонок), (2) идентичный порядок
   * не создаёт нового состояния (холостые витки измерение→setState). */
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
      const next = moveTaskToStage(prev ?? [], String(active.id), overStage, index);
      return isSameOrder(prev ?? [], next) ? (prev ?? []) : next;
    });
  };

  const onDragEnd = (event: DragEndEvent) => {
    const task = activeTask;
    setActiveTask(null);
    if (!task || !event.over) return;
    const overId = String(event.over.id);
    // Финиш внутри колонки — перестановка; между колонками борд уже живой.
    const settled =
      stageOf(overId)?.id === task.stage.id ? reorderWithinStage(items, task.id, overId) : items;
    setBoard(settled);
    const finalStage = settled.find((t) => t.id === task.id)?.stage;
    if (!finalStage) return;
    const index = indexOfInStage(settled, task.id);
    const snapshot = snapshotRef.current ?? [];
    const before = snapshot.find((t) => t.id === task.id);
    if (before?.stage.id === finalStage.id && indexOfInStage(snapshot, task.id) === index) return;
    const fromId = task.stage.id;
    setCountDelta((prev) => ({
      ...prev,
      [finalStage.id]: (prev[finalStage.id] ?? 0) + 1,
      [fromId]: (prev[fromId] ?? 0) - 1,
    }));
    updateStage.mutate(
      { taskId: task.id, stageId: finalStage.id, index },
      {
        onError: () =>
          setCountDelta((prev) => ({
            ...prev,
            [finalStage.id]: (prev[finalStage.id] ?? 0) - 1,
            [fromId]: (prev[fromId] ?? 0) + 1,
          })),
      },
    );
  };

  const onDragCancel = () => {
    setActiveTask(null);
    if (snapshotRef.current) setBoard(snapshotRef.current);
  };

  if (!stages || !board) {
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
      collisionDetection={collision}
      // Живой переезд меняет раскладку ВО ВРЕМЯ drag: дефолтная стратегия
      // меряет дропаблы один раз на старте → коллизия лагает на устаревших
      // rect (фризы/джиттер на границах). Always — перемер каждый цикл.
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div className="flex h-full gap-5 overflow-x-auto px-6 pt-1 pb-4">
        {stageList.map((stage) => {
          const cards = items.filter((t) => t.stage.id === stage.id);
          return (
            <TaskKanbanColumn
              key={stage.id}
              stage={stage}
              count={stage.count + (countDelta[stage.id] ?? 0)}
              cardIds={cards.map((t) => t.id)}
              hasNext={cursors[stage.id] !== null && cursors[stage.id] !== undefined}
              loadingMore={Boolean(loadingMore[stage.id])}
              onLoadMore={() => loadMore(stage.id)}
            >
              {cards.map((task) => (
                <TaskKanbanSortableCard
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
