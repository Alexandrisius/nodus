import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
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

import { api } from '../../api-client.js';
import {
  indexOfInStage,
  isSamePlacement,
  moveTaskToStage,
  reorderWithinStage,
  type BoardAxis,
} from '../../lib/board/kanban-board.js';
import { makeKanbanCollision } from '../../lib/board/kanban-collision.js';

/** Лимит страницы фида колонки (industry: колонки держат тысячи карточек —
 *  целиком не грузим; дальше sentinel-подгрузка в колонке, как в Битриксе). */
export const KANBAN_FEED_LIMIT = 30;

export interface KanbanMoveVars {
  taskId: string;
  stageId: string;
  index: number;
}

interface UseKanbanBoardParams<S extends TaskStage> {
  /** Ось доски (globalAxis | personalAxis, ADR-0008). */
  axis: BoardAxis;
  stages: S[] | undefined;
  /** queryKey первых страниц колонок (фича: tasksKeys.kanban(scope));
   *  инвалидация ключа пересобирает борд из свежих фидов (перенос задачи
   *  степпером из карточки, CRUD колонок — доска не протухает). */
  queryKey: readonly unknown[];
  /** URL фида колонки (cursor=null — первая страница). */
  feedUrl: (stageId: string, cursor: string | null) => string;
  /** Персист переноса (мутация фичи); onError обязателен — хук откатывает
   *  борд к снапшоту dragStart (I4). */
  onMove: (vars: KanbanMoveVars, opts: { onError: () => void }) => void;
  /** Хуки счётчиков шапок «n из m» (задачи: countDelta при оптимистичном
   *  переносе и его откате; проектная доска не передаёт). */
  onMoveCommitted?: (fromStageId: string, toStageId: string) => void;
  onMoveRolledBack?: (fromStageId: string, toStageId: string) => void;
}

/**
 * Канбан-движок (аудит #45: вынос ~180 строк дубля task/project-карманов):
 * борд-состояние, фиды колонок через React Query, sentinel-подгрузка,
 * dnd-жизнь (живая сортировка onDragOver, анти-осциллятор recentlyMoved,
 * гейт isSamePlacement), Esc-откат к снапшоту. Фича оставляет за собой
 * колонку, карточку, конфиг оси/фида/мутации и экстра-механики (CRUD
 * колонок, quick-add, счётчики) — доска 6-го модуля = конфиг, не копия.
 * Официальный паттерн dnd-kit + React Query: борд — локальное состояние,
 * синхронизированное с query ВНЕ переноса; структурная смена набора колонок
 * (подпись стадий в ключе) пересобирает борд из фидов.
 */
export function useKanbanBoard<S extends TaskStage>({
  axis,
  stages,
  queryKey,
  feedUrl,
  onMove,
  onMoveCommitted,
  onMoveRolledBack,
}: UseKanbanBoardParams<S>) {
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

  const stageList = useMemo(() => [...(stages ?? [])].sort((a, b) => a.order - b.order), [stages]);
  const stageById = useMemo(() => new Map(stageList.map((s) => [s.id, s] as const)), [stageList]);
  // Подпись набора колонок — часть queryKey: CRUD колонок пересобирает фиды.
  const stageSignature = stageList.map((s) => s.id).join('|');
  // stageList — по ссылке для эффекта синхронизации: триггер пересборки —
  // ПОДПИСЬ/данные, а не идентичность массива (переименование колонки даёт
  // новый stages без смены набора — борд с догруженными страницами не
  // должен сбрасываться).
  const stageListRef = useRef(stageList);
  stageListRef.current = stageList;
  const draggingRef = useRef(false);

  // Первые страницы колонок — через React Query: кэш, инвалидации мутаций
  // (перенос степпером — tasksKeys.kanbanAll), дедуп. Инвалидация/смена
  // подписи → новые первые страницы → борд пересобирается (ручные догрузки
  // sentinel-ом сбрасываются — то же поведение, что при смене набора колонок).
  const { data: firstPages } = useQuery({
    queryKey: [...queryKey, stageSignature],
    queryFn: () =>
      Promise.all(
        stageListRef.current.map((s) => api<Paginated<TaskListItem>>(feedUrl(s.id, null))),
      ),
    enabled: stageSignature.length > 0,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!firstPages || draggingRef.current) return;
    // Во время переноса борд — локальный (живая сортировка); свежие страницы
    // применятся синхронизацией после дропа (инвалидация мутации).
    setBoard(firstPages.flatMap((p) => p.items));
    const cur = Object.fromEntries(
      stageListRef.current.map((s, i) => [s.id, firstPages[i]?.nextCursor ?? null]),
    );
    setCursors(cur);
    cursorsRef.current = cur;
  }, [firstPages, stageSignature]);

  /** Подгрузка следующей страницы колонки (sentinel в скролл-контейнере).
   *  Стабильная идентичность: уходит в колонки как проп, новая стрелка на
   *  каждый рендер пересоздавала бы IntersectionObserver во время drag. */
  const loadMore = useCallback(
    (stageId: string) => {
      const cursor = cursorsRef.current[stageId];
      if (cursor === null || cursor === undefined || loadingMoreRef.current[stageId]) return;
      setLoadingMore((prev) => ({ ...prev, [stageId]: true }));
      loadingMoreRef.current = { ...loadingMoreRef.current, [stageId]: true };
      void api<Paginated<TaskListItem>>(feedUrl(stageId, cursor)).then((page) => {
        setBoard((prev) => [...(prev ?? []), ...page.items]);
        setCursors((prev) => ({ ...prev, [stageId]: page.nextCursor }));
        cursorsRef.current = { ...cursorsRef.current, [stageId]: page.nextCursor };
        setLoadingMore((prev) => ({ ...prev, [stageId]: false }));
        loadingMoreRef.current = { ...loadingMoreRef.current, [stageId]: false };
      });
    },
    [feedUrl],
  );

  const sensors = useSensors(
    // distance: клик без движения — не drag, а открытие слайдера.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const items = useMemo(() => board ?? [], [board]);
  const numberById = useMemo(() => new Map(items.map((t) => [t.id, t.number] as const)), [items]);
  const childrenOf = useMemo(
    () => (columnId: string) => items.filter((t) => axis.keyOf(t) === columnId).map((t) => t.id),
    [items, axis],
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

  const stageOf = useCallback(
    (id: UniqueIdentifier): TaskStage | undefined =>
      stageById.get(axis.keyOf(items.find((t) => t.id === id) ?? ({} as TaskListItem)) ?? ''),
    [stageById, items, axis],
  );

  const onDragStart = (event: DragStartEvent) => {
    draggingRef.current = true;
    snapshotRef.current = items;
    const task = items.find((t) => t.id === event.active.id) ?? null;
    setActiveTask(task);
    // Контекст призрака: без parentNumber оверлей ниже слота (пропадает
    // строка ПОДЗАДАЧА) → микроскачки раскладки при дропе.
    setActiveParent(task?.parentId ? numberById.get(task.parentId) : undefined);
  };

  /** Живой переезд между колонками: карточка встаёт в целевую колонку ещё
   *  до дропа (индекс — от карточки под указателем, ниже/выше её центра).
   *  Предохранители цикла update depth: (1) кадр после межколоночного переноса
   *  игнорируем (анти-осциллятор на границе колонок), (2) идентичное РАЗМЕЩЕНИЕ
   *  не создаёт нового состояния (isSamePlacement — холостые витки
   *  измерение→setState). */
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
      const next = moveTaskToStage(prev ?? [], String(active.id), overStage, index, axis);
      return isSamePlacement(prev ?? [], next, axis) ? (prev ?? []) : next;
    });
  };

  const onDragEnd = (event: DragEndEvent) => {
    const task = activeTask;
    setActiveTask(null);
    draggingRef.current = false;
    if (!task || !event.over) {
      snapshotRef.current = null;
      return;
    }
    const overId = String(event.over.id);
    // Финиш внутри колонки — перестановка; между колонками борд уже живой.
    const settled =
      stageOf(overId)?.id === axis.keyOf(task)
        ? reorderWithinStage(items, task.id, overId, axis)
        : items;
    setBoard(settled);
    const finalStage = stageById.get(
      axis.keyOf(settled.find((t) => t.id === task.id) ?? task) ?? '',
    );
    if (!finalStage) return;
    const index = indexOfInStage(settled, task.id, axis);
    const snapshot = snapshotRef.current ?? [];
    const before = snapshot.find((t) => t.id === task.id);
    if (
      axis.keyOf(before ?? task) === finalStage.id &&
      indexOfInStage(snapshot, task.id, axis) === index
    ) {
      return;
    }
    const fromId = axis.keyOf(task) ?? '';
    onMoveCommitted?.(fromId, finalStage.id);
    onMove(
      { taskId: task.id, stageId: finalStage.id, index },
      {
        onError: () => {
          setBoard(snapshot);
          onMoveRolledBack?.(fromId, finalStage.id);
        },
      },
    );
    snapshotRef.current = null;
  };

  const onDragCancel = () => {
    setActiveTask(null);
    draggingRef.current = false;
    if (snapshotRef.current) setBoard(snapshotRef.current);
    snapshotRef.current = null;
  };

  /** Новая задача — в топ колонки борда сразу (без refetch). */
  const insertNewTask = useCallback(
    (stageId: string, task: TaskListItem) => {
      setBoard((prev) => {
        const rest = prev ?? [];
        const firstOfColumn = rest.find((t) => axis.keyOf(t) === stageId);
        if (!firstOfColumn) return [...rest, task];
        const at = rest.indexOf(firstOfColumn);
        return [...rest.slice(0, at), task, ...rest.slice(at)];
      });
    },
    [axis],
  );

  return {
    /** Готовность к рендеру доски (иначе — скелетон). */
    ready: Boolean(stages && board),
    items,
    stageList,
    stageById,
    numberById,
    sensors,
    collision,
    /** Стратегия перемера dnd: живой переезд меняет раскладку ВО ВРЕМЯ drag —
     *  дефолт меряет дропаблы один раз на старте → коллизия лагала бы на
     *  устаревших rect (фризы на границах). Always — перемер каждый цикл. */
    measuring: { droppable: { strategy: MeasuringStrategy.Always } },
    dndHandlers: { onDragStart, onDragOver, onDragEnd, onDragCancel },
    activeTask,
    activeParent,
    cursors,
    loadingMore,
    loadMore,
    insertNewTask,
  };
}
