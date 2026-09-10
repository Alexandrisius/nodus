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

import { Skeleton } from '@nodus/ui/components/skeleton';

import { api } from '../../../shared/api-client.js';
import { useViewFields } from '../../../shared/views/use-view-fields.js';
import {
  indexOfInStage,
  isSamePlacement,
  moveTaskToStage,
  personalAxis,
  reorderWithinStage,
} from '../../../shared/lib/board/kanban-board.js';
import { makeKanbanCollision } from '../../../shared/lib/board/kanban-collision.js';
import { BoardSortableCard } from '../../../shared/ui/board/board-sortable-card.js';
import {
  useCreatePersonalStage,
  useCreateTask,
  useDeletePersonalStage,
  usePersonalStages,
  useUpdatePersonalStage,
  useUpdateTaskPersonalStage,
} from '../api/personal-stages-api.js';
import { taskCardFields } from '../lib/task-fields.js';
import { TaskKanbanCard } from './task-kanban-card.js';
import { TaskKanbanColumn } from './task-kanban-column.js';
import { TaskStageCreate } from './task-stage-create.js';

/** Канбан «Мой план» (ADR-0007): живая сортировка dnd-kit sortable — карточки
 * уступают место и переезжают между колонками ВО ВРЕМЯ переноса (onDragOver),
 * финализация — персист стадии+индекса (PATCH, оптимистично, I4); Esc — откат
 * к снапшоту dragStart. Призрак DragOverlay садится на живой слот (источник
 * уже в целевой колонке), поэтому «обратного перелёта» при дропе нет.
 * Борд — локальное состояние, синхронизированное с query вне переноса
 * (официальный паттерн dnd-kit + React Query). */
/** Канбан «Мой план» (ADR-0007 + ADR-0008): колонки — ЛИЧНЫЕ стадии
 * пользователя (личная схема): цветные чипы, меню колонки (переименовать /
 * цвет / удалить — единственную нельзя), создание в конце ряда. DnD переносит
 * задачу по личной оси (personalStageId, глобальная стадия не трогается);
 * живая сортировка dnd-kit — карточки уступают место ВО ВРЕМЯ переноса
 * (onDragOver), финализация — персист колонки+индекса (PATCH, оптимистично).
 * Борд — локальное состояние, синхронизированное с query вне переноса;
 * структурная смена набора колонок (создание/удаление) перезагружает борд. */
export function TaskKanban() {
  const { data: stages } = usePersonalStages();
  const updatePersonalStage = useUpdateTaskPersonalStage();
  const createStage = useCreatePersonalStage();
  const createTask = useCreateTask();
  const updateStageMeta = useUpdatePersonalStage();
  const deleteStage = useDeletePersonalStage();
  const { isVisible } = useViewFields('tasks.kanban', taskCardFields);

  const [board, setBoard] = useState<TaskListItem[] | null>(null);
  const [cursors, setCursors] = useState<Record<string, string | null>>({});
  const [loadingMore, setLoadingMore] = useState<Record<string, boolean>>({});
  const [countDelta, setCountDelta] = useState<Record<string, number>>({});
  const [activeTask, setActiveTask] = useState<TaskListItem | null>(null);
  const [activeParent, setActiveParent] = useState<number | undefined>(undefined);
  const snapshotRef = useRef<TaskListItem[] | null>(null);
  const lastOverId = useRef<UniqueIdentifier | null>(null);
  const recentlyMoved = useRef(false);
  const cursorsRef = useRef<Record<string, string | null>>({});
  const loadingMoreRef = useRef<Record<string, boolean>>({});

  // Первые страницы колонок (industry: колонки держат тысячи карточек —
  // целиком не грузим; дальше sentinel-подгрузка в колонке, как в Битриксе).
  useEffect(() => {
    if (!stages || board) return;
    let alive = true;
    void Promise.all(
      stages.map((s) => api<Paginated<TaskListItem>>(`/tasks?personalStageId=${s.id}&limit=30`)),
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
  }, [stages, board]);

  /** Подгрузка следующей страницы колонки (sentinel в скролл-контейнере).
   *  Стабильная идентичность: уходит в колонки как проп, новая стрелка на
   *  каждый рендер пересоздавала бы IntersectionObserver во время drag. */
  const loadMore = useCallback((stageId: string) => {
    const cursor = cursorsRef.current[stageId];
    if (cursor === null || cursor === undefined || loadingMoreRef.current[stageId]) return;
    setLoadingMore((prev) => ({ ...prev, [stageId]: true }));
    loadingMoreRef.current = { ...loadingMoreRef.current, [stageId]: true };
    void api<Paginated<TaskListItem>>(
      `/tasks?personalStageId=${stageId}&limit=30&cursor=${cursor}`,
    ).then((page) => {
      setBoard((prev) => [...(prev ?? []), ...page.items]);
      setCursors((prev) => ({ ...prev, [stageId]: page.nextCursor }));
      cursorsRef.current = { ...cursorsRef.current, [stageId]: page.nextCursor };
      setLoadingMore((prev) => ({ ...prev, [stageId]: false }));
      loadingMoreRef.current = { ...loadingMoreRef.current, [stageId]: false };
    });
  }, []);

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
    () => (columnId: string) =>
      items.filter((t) => t.personalStageId === columnId).map((t) => t.id),
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
    stageById.get(items.find((t) => t.id === id)?.personalStageId ?? '');

  const onDragStart = (event: DragStartEvent) => {
    snapshotRef.current = items;
    const task = items.find((t) => t.id === event.active.id) ?? null;
    setActiveTask(task);
    // Контекст призрака: без parentNumber оверлей ниже слота (пропадает
    // строка ПОДЗАДАЧА) → микроскачки раскладки при дропе.
    setActiveParent(task?.parentId ? numberById.get(task.parentId) : undefined);
  };

  /** Живой переезд между колонками: карточка встаёт в целевую колонку ещё
   * до дропа (индекс — от карточки под указателем, ниже/выше её центра).
   * Предохранители цикла update depth: (1) кадр после межколоночного переноса
   * игнорируем (анти-осциллятор на границе колонок), (2) идентичное РАЗМЕЩЕНИЕ
   * не создаёт нового состояния (isSamePlacement: порядок id + колонка —
   * холостые витки измерение→setState). */
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
      const next = moveTaskToStage(prev ?? [], String(active.id), overStage, index, personalAxis);
      return isSamePlacement(prev ?? [], next, personalAxis) ? (prev ?? []) : next;
    });
  };

  const onDragEnd = (event: DragEndEvent) => {
    const task = activeTask;
    setActiveTask(null);
    if (!task || !event.over) return;
    const overId = String(event.over.id);
    // Финиш внутри колонки — перестановка; между колонками борд уже живой.
    const settled =
      stageOf(overId)?.id === task.personalStageId
        ? reorderWithinStage(items, task.id, overId, personalAxis)
        : items;
    setBoard(settled);
    const finalStage = stageById.get(settled.find((t) => t.id === task.id)?.personalStageId ?? '');
    if (!finalStage) return;
    const index = indexOfInStage(settled, task.id, personalAxis);
    const snapshot = snapshotRef.current ?? [];
    const before = snapshot.find((t) => t.id === task.id);
    if (
      before?.personalStageId === finalStage.id &&
      indexOfInStage(snapshot, task.id, personalAxis) === index
    )
      return;
    const fromId = task.personalStageId ?? '';
    setCountDelta((prev) => ({
      ...prev,
      [finalStage.id]: (prev[finalStage.id] ?? 0) + 1,
      [fromId]: (prev[fromId] ?? 0) - 1,
    }));
    updatePersonalStage.mutate(
      { taskId: task.id, personalStageId: finalStage.id, index },
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

  /** Структурная смена набора колонок (создание/удаление личной стадии)
   *  перезагружает борд: задачи удалённой колонки переехали на сервере,
   *  локальный порядок пересобираем из фидов. Вне переноса drag. */
  const stageSignature = stageList.map((s) => s.id).join('|');
  const prevSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevSignatureRef.current === null) {
      prevSignatureRef.current = stageSignature;
      return;
    }
    if (prevSignatureRef.current !== stageSignature && !activeTask) {
      prevSignatureRef.current = stageSignature;
      setBoard(null);
      setCursors({});
      cursorsRef.current = {};
      setCountDelta({});
    }
  }, [stageSignature, activeTask]);

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
          const cards = items.filter((t) => t.personalStageId === stage.id);
          return (
            <TaskKanbanColumn
              key={stage.id}
              stage={stage}
              count={stage.count + (countDelta[stage.id] ?? 0)}
              cardIds={cards.map((t) => t.id)}
              hasNext={cursors[stage.id] !== null && cursors[stage.id] !== undefined}
              loadingMore={Boolean(loadingMore[stage.id])}
              canDelete={stageList.length > 1}
              onLoadMore={loadMore}
              onRename={(stageId, name) => updateStageMeta.mutate({ stageId, body: { name } })}
              onRecolor={(stageId, color) => updateStageMeta.mutate({ stageId, body: { color } })}
              onDelete={(stageId) => deleteStage.mutate(stageId)}
              onCreateTask={(stageId, title) =>
                createTask.mutate(
                  { title, personalStageId: stageId },
                  {
                    // Новая задача — в топ колонки борда сразу (без refetch).
                    onSuccess: (task) => {
                      setBoard((prev) => {
                        const rest = prev ?? [];
                        const firstOfColumn = rest.find((t) => t.personalStageId === stageId);
                        if (!firstOfColumn) return [...rest, task];
                        const at = rest.indexOf(firstOfColumn);
                        return [...rest.slice(0, at), task, ...rest.slice(at)];
                      });
                      setCountDelta((prev) => ({
                        ...prev,
                        [stageId]: (prev[stageId] ?? 0) + 1,
                      }));
                    },
                  },
                )
              }
            >
              {cards.map((task) => (
                <BoardSortableCard key={task.id} id={task.id} stageId={task.stage.id}>
                  {({ placeholder }) => (
                    <TaskKanbanCard
                      task={task}
                      parentNumber={task.parentId ? numberById.get(task.parentId) : undefined}
                      isVisible={isVisible}
                      placeholder={placeholder}
                    />
                  )}
                </BoardSortableCard>
              ))}
            </TaskKanbanColumn>
          );
        })}
        <TaskStageCreate
          creating={createStage.isPending}
          onCreate={(body) => createStage.mutate(body)}
        />
      </div>
      <DragOverlay>
        {activeTask ? (
          <TaskKanbanCard
            task={activeTask}
            parentNumber={activeParent}
            isVisible={isVisible}
            overlay
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
