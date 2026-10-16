import { Loader2 } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ChatMessage } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { ensureOlderPage } from './messages-history.js';

/**
 * Догрузка истории при прокрутке ВВЕРХ (#307, модель Telegram/Битрикс24):
 * sentinel у верха ленты (IntersectionObserver, root=viewport, rootMargin —
 * предзапрос ДО упора в потолок) грузит страницу старее границы кэша и
 * преппендит её в плоский кэш (messages-history.ts).
 *
 * Сохранение позиции просмотра — компенсация скролла: перед загрузкой
 * снимаются scrollTop/scrollHeight вьюпорта, после преппенда (layout-effect
 * на смену items) scrollTop сдвигается на высоту добавленного контента —
 * глаз остаётся на том же сообщении. Единая механика для всех лент
 * (беседа/посты канала/тред/витрина), включая контейнеры без
 * MessageScroller-примитива.
 *
 * Витрине «Избранного» нужен второй источник (страницы избранного) —
 * колбэк loadMore переопределяется хостом, механика сентинела общая.
 */
export function useHistoryLoader({
  conversationId,
  threadRootId = null,
  viewportRef,
  hasMore,
  items,
  enabled = true,
  loadMore,
}: {
  conversationId: string;
  threadRootId?: string | null;
  viewportRef: RefObject<HTMLDivElement | null>;
  /** Есть ли история старее кэша (nextCursor !== null; витрина — ИЛИ favs). */
  hasMore: boolean;
  /** Текущие элементы: смена ссылки после преппенда = точка компенсации. */
  items: readonly ChatMessage[];
  /** Лента пуста/грузится — сентинел не наблюдаем. */
  enabled?: boolean;
  /** Переопределение загрузки (витрина: история + страницы избранного). */
  loadMore?: () => Promise<boolean>;
}): { loadingOlder: boolean; topSentinel: ReactNode; loadOlder: () => Promise<boolean> } {
  const queryClient = useQueryClient();
  const [loadingOlder, setLoadingOlder] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const anchorRef = useRef<{ top: number; height: number } | null>(null);
  const prevItemsRef = useRef(items);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;

  const loadOlder = useCallback(() => {
    if (loadingRef.current || !hasMoreRef.current) return Promise.resolve(false);
    loadingRef.current = true;
    setLoadingOlder(true);
    // Якорь компенсации — только когда вьюпорт уже прокручен (у самого низа
    // prepend не виден, компенсировать нечего).
    const el = viewportRef.current;
    if (el && el.scrollTop > 0) anchorRef.current = { top: el.scrollTop, height: el.scrollHeight };
    const task = loadMore?.() ?? ensureOlderPage(queryClient, conversationId, threadRootId);
    void task.finally(() => {
      loadingRef.current = false;
      setLoadingOlder(false);
    });
    return task;
  }, [conversationId, threadRootId, loadMore, queryClient, viewportRef]);

  // Компенсация ТОЛЬКО преппенда: якорь живёт до смены ПЕРВОГО элемента
  // (ревью #307: аппенд/патч чужого события в окне полёта не должен
  // расходовать якорь — иначе сдвиг по чужой высоте, а настоящий преппенд
  // остался бы без компенсации). Пустой исход (сетевой отказ) — якорь
  // перезапишется следующим запуском загрузки.
  useLayoutEffect(() => {
    const prev = prevItemsRef.current;
    const changed = prev !== items;
    const prepended = changed && items[0]?.id !== prev[0]?.id;
    prevItemsRef.current = items;
    const anchor = anchorRef.current;
    if (!prepended || !anchor) return;
    anchorRef.current = null;
    const el = viewportRef.current;
    if (!el) return;
    const delta = el.scrollHeight - anchor.height;
    if (delta > 0) el.scrollTop = anchor.top + delta;
  }, [items, viewportRef]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = viewportRef.current;
    if (!enabled || !sentinel || !root || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadOlder();
      },
      // Предзапрос за пол-экрана до упора в потолок (модель Telegram).
      { root, rootMargin: '600px 0px 0px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [enabled, hasMore, loadOlder, viewportRef]);

  const topSentinel = (
    <div
      ref={sentinelRef}
      className="flex h-5 shrink-0 items-center justify-center"
      aria-hidden={!loadingOlder && hasMore}
    >
      {loadingOlder ? (
        <>
          <Loader2 className="text-muted-foreground size-3.5 animate-spin" aria-hidden />
          <span className="text-muted-foreground ml-1.5 text-[11px] leading-4">
            {ui.chat.historyLoading}
          </span>
        </>
      ) : !hasMore ? (
        <span className="text-muted-foreground text-[11px] leading-4">{ui.chat.historyStart}</span>
      ) : null}
    </div>
  );

  return { loadingOlder, topSentinel, loadOlder };
}
