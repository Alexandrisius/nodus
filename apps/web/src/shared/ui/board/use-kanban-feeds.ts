import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Paginated, TaskListItem, TaskStage } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { api } from '../../api-client.js';

interface UseKanbanFeedsParams {
  /** Колонки доски в порядке отображения. */
  stageList: TaskStage[];
  /** queryKey первых страниц (см. UseKanbanBoardParams.queryKey). */
  queryKey: readonly unknown[];
  feedUrl: (stageId: string, cursor: string | null) => string;
  /** Идёт перенос: свежие страницы не применяются до дропа. */
  draggingRef: RefObject<boolean>;
  /** Сеттер борда движка (фиды наполняют его, dnd — переставляет). */
  setBoard: Dispatch<SetStateAction<TaskListItem[] | null>>;
}

/**
 * Фиды колонок канбана (часть движка use-kanban-board): первые страницы
 * через React Query, курсоры и sentinel-догрузка следующих страниц с
 * обработкой ошибок. Борд — владение движка: фиды пишут в него через
 * setBoard (пересборка из первых страниц, дописывание догрузок).
 */
export function useKanbanFeeds({
  stageList,
  queryKey,
  feedUrl,
  draggingRef,
  setBoard,
}: UseKanbanFeedsParams) {
  const [cursors, setCursors] = useState<Record<string, string | null>>({});
  const [loadingMore, setLoadingMore] = useState<Record<string, boolean>>({});
  const cursorsRef = useRef<Record<string, string | null>>({});
  const loadingMoreRef = useRef<Record<string, boolean>>({});
  /** Колонки, чья догрузка упала (анти-шквал повторов sentinel-а). */
  const failedRef = useRef<Record<string, boolean>>({});
  // feedUrl потребители передают инлайн-стрелкой (новая на рендер): через
  // ref loadMore сохраняет стабильную идентичность (см. ниже).
  const feedUrlRef = useRef(feedUrl);
  feedUrlRef.current = feedUrl;

  // Подпись набора колонок — часть queryKey: CRUD колонок пересобирает фиды.
  const stageSignature = stageList.map((s) => s.id).join('|');
  // stageList — по ссылке для эффекта синхронизации: триггер пересборки —
  // ПОДПИСЬ/данные, а не идентичность массива (переименование колонки даёт
  // новый stages без смены набора — борд с догруженными страницами не
  // должен сбрасываться).
  const stageListRef = useRef(stageList);
  stageListRef.current = stageList;

  // Первые страницы колонок — через React Query: кэш, инвалидации мутаций
  // (перенос степпером — tasksKeys.kanbanAll), дедуп. Инвалидация/смена
  // подписи → новые первые страницы → борд пересобирается (ручные догрузки
  // sentinel-ом сбрасываются — то же поведение, что при смене набора колонок).
  const { data: firstPages } = useQuery({
    queryKey: [...queryKey, stageSignature],
    queryFn: () =>
      Promise.all(
        stageListRef.current.map((s) =>
          api<Paginated<TaskListItem>>(feedUrlRef.current(s.id, null)),
        ),
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
    // Свежие фиды — повод снова пробовать догрузку сбойных колонок.
    failedRef.current = {};
  }, [firstPages, stageSignature, draggingRef, setBoard]);

  /** Подгрузка следующей страницы колонки (sentinel в скролл-контейнере).
   *  Стабильная идентичность: уходит в колонки как проп, новая стрелка на
   *  каждый рендер пересоздавала бы IntersectionObserver во время drag. */
  const loadMore = useCallback(
    (stageId: string) => {
      const cursor = cursorsRef.current[stageId];
      if (cursor === null || cursor === undefined || loadingMoreRef.current[stageId]) return;
      if (failedRef.current[stageId]) return;
      setLoadingMore((prev) => ({ ...prev, [stageId]: true }));
      loadingMoreRef.current = { ...loadingMoreRef.current, [stageId]: true };
      const settle = () => {
        setLoadingMore((prev) => ({ ...prev, [stageId]: false }));
        loadingMoreRef.current = { ...loadingMoreRef.current, [stageId]: false };
      };
      api<Paginated<TaskListItem>>(feedUrlRef.current(stageId, cursor)).then(
        (page) => {
          setBoard((prev) => [...(prev ?? []), ...page.items]);
          setCursors((prev) => ({ ...prev, [stageId]: page.nextCursor }));
          cursorsRef.current = { ...cursorsRef.current, [stageId]: page.nextCursor };
          settle();
        },
        () => {
          // Ошибка догрузки: флаг сбрасывается (иначе вечный скелетон и
          // unhandled rejection), колонка помечается сбойной — sentinel
          // пересоздаёт observer при смене loadingMore и сразу дёрнул бы
          // догрузку снова (шквал запросов и тостов при обрыве сети).
          // Пометка снимается пересборкой борда из свежих фидов (рефеч,
          // инвалидация) — тогда догрузка снова разрешена.
          failedRef.current = { ...failedRef.current, [stageId]: true };
          settle();
          toast.error(ui.common.loadError);
        },
      );
    },
    [setBoard],
  );

  return { cursors, loadingMore, loadMore };
}
