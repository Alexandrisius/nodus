import { useEffect, type RefObject } from 'react';

/** Бесконечная подгрузка страниц: sentinel у дна скролл-контейнера таблицы
 *  (IntersectionObserver с root=контейнер, модель битриксовского журнала).
 *  Одна механика DataTable и TaskList (аудит #45 — была копией в обоих). */
export function useInfiniteSentinel(
  containerRef: RefObject<HTMLElement | null>,
  sentinelRef: RefObject<HTMLElement | null>,
  {
    hasNextPage,
    isFetchingNextPage,
    onLoadMore,
  }: {
    hasNextPage?: boolean;
    isFetchingNextPage?: boolean;
    onLoadMore?: () => void;
  },
) {
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = containerRef.current;
    if (!sentinel || !root || !hasNextPage || isFetchingNextPage || !onLoadMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadMore();
      },
      { root },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [containerRef, sentinelRef, hasNextPage, isFetchingNextPage, onLoadMore]);
}
