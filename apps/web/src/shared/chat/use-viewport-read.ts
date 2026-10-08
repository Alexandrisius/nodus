import { useEffect, useRef, type RefObject } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { ChatMessage } from '@nodus/contracts';

import { api } from '../api-client.js';
import { isDomainMocked } from '../api/api-mock-config.js';
import { wsDebugLog } from '../socket/ws-debug.js';
import { chatKeys } from './api.js';
import {
  createReadReceiptScheduler,
  type ReadReceiptScheduler,
} from './viewport-read-scheduler.js';

/**
 * Квитанции просмотров (#102 раунд 2; раунд 3 — ЧЕСТНАЯ ВИДИМОСТЬ): строка
 * просмотрена ⇔ её НИЖНИЙ КРАЙ в вьюпорте (виден верх пузыря — «отправлено»,
 * не «просмотрено»; IO threshold:0 считал пересечение любого пикселя).
 * ЕДИНЫЙ механизм для трёх лент — IntersectionObserver с root=скроллер по
 * строкам `[data-message-id]` держит КОЛИЧЕСТВО пересекающихся, а решение
 * «нижний край виден» принимается по актуальной геометрии: в колбэке IO и на
 * скролле контейнера (passive, rAF-троттл) — IO не перефирашивает entries
 * частично видимых строк при прокрутке внутри порога.
 *
 * Квитанция двигает watermark БЕСЕДЫ («увидел где угодно = просмотрено»);
 * threadRootId — квитанция ИЗ ТРЕДА: дополнительно гасит точку «есть новые»
 * на посте (watermark трэда наблюдателя, раунд 3).
 */

type SeqSource = Pick<ChatMessage, 'id' | 'seq'>;

/** Допуск «нижний край виден» (px): субпиксельное округление и тень строк. */
export const SEEN_TOLERANCE_PX = 4;

/** Чистая геометрия просмотренности: max seq строк, чей низ выше сгиба.
 *  Unit-тестируется без DOM (мок-кандидаты с координатами). */
export function maxSeenSeq(
  rows: readonly { seq: number; bottom: number }[],
  foldBottom: number,
  tolerance = SEEN_TOLERANCE_PX,
): number | null {
  let max: number | null = null;
  for (const row of rows) {
    if (row.bottom <= foldBottom + tolerance && (max === null || row.seq > max)) {
      max = row.seq;
    }
  }
  return max;
}

/**
 * Форс-дозапись квитанций всех бесед (фидбек 08.10: «счётчик висит на 1,
 * пропадает только после отправки»): сокрытие оболочки в трей не меняет
 * document.hidden в WebView2 — visibilitychange не стреляет и хвост
 * квитанции оставался неотправленным. Оболочка сигналит shell-visibility,
 * вызов дозаписывает увиденное немедленно.
 */
let flushOnHide: (() => void) | null = null;

/** Регистрация колбэка «оболочка скрылась» (вызывает desktop-bridge). */
export function setShellHiddenFlush(fn: (() => void) | null): void {
  flushOnHide = fn;
}

/** Вызов из desktop-bridge при visible=false. */
export function flushReadReceiptsOnShellHide(): void {
  flushOnHide?.();
}

/**
 * Кэш списка бесед после квитанции: не ждём рефеча — unreadCount беседы
 * зануляется сразу (квитанция покрывает всю видимость). Гонка «GET ушёл
 * раньше коммита read» возвращала старый unreadCount, и заголовок/бейдж
 * оболочки зависали до F5 (зомби-бейдж #254). Чистая функция — юнит-тест.
 */
export function applyReadToCache(queryClient: QueryClient, conversationId: string): void {
  queryClient.setQueryData<{ items?: { id: string; unreadCount: number }[] }>(
    chatKeys.conversations(),
    (old) =>
      old
        ? {
            ...old,
            items: old.items?.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c)),
          }
        : old,
  );
}

function useReadReceiptScheduler(
  conversationId: string,
  threadRootIdRef: RefObject<string | null>,
): RefObject<ReadReceiptScheduler | null> {
  const queryClient = useQueryClient();
  const schedulerRef = useRef<ReadReceiptScheduler | null>(null);

  useEffect(() => {
    const scheduler = createReadReceiptScheduler({
      send: (upToSeq) => {
        const threadRootId = threadRootIdRef.current;
        void api(`/chat/conversations/${conversationId}/read`, {
          method: 'POST',
          body: { upToSeq, ...(threadRootId ? { threadRootId } : {}) },
        })
          .then(() => {
            // Бейдж непрочитанных гаснет сразу и без WS (событие придёт —
            // инвалидация идемпотентна).
            applyReadToCache(queryClient, conversationId);
            void queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
            if (threadRootId) {
              // Точка «есть новые» на посте гасится квитанцией трэда.
              void queryClient.invalidateQueries({
                queryKey: chatKeys.threadStates(conversationId),
              });
            }
            if (isDomainMocked('chat')) {
              // МОК-симуляция собеседника (аудит #45): в моках нет WS/поллинга —
              // «просматривает» то же видимое чуть позже, отложенный рефеч
              // переключает галочки (бывший таймер отправки, #102 р.2).
              window.setTimeout(() => {
                void queryClient.invalidateQueries({
                  queryKey: chatKeys.messages(conversationId),
                });
              }, 2500);
            }
          })
          .catch(() => undefined); // квитанция — фоновая; догонит следующая
      },
    });
    schedulerRef.current = scheduler;

    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') {
        scheduler.flush(); // уход из таба — зафиксировать увиденное
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onVisibility);
    const prevFlush = flushOnHide;
    setShellHiddenFlush(() => scheduler.flush());

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onVisibility);
      if (flushOnHide === scheduler.flush || prevFlush === null) {
        setShellHiddenFlush(null);
      }
      scheduler.flush(); // смена беседы: хвост ниже вьюпорта не прочитан
      scheduler.dispose();
      schedulerRef.current = null;
    };
  }, [conversationId, queryClient, threadRootIdRef]);

  return schedulerRef;
}

/**
 * Наблюдение видимости строк ленты: IO с root=скроллер держит множество
 * пересекающихся строк; решение «нижний край виден» — по живой геометрии
 * (getBoundingClientRect) в колбэке IO и на скролле. Перерисовок НЕТ —
 * чистый императив в эффекте; при смене данных (рефетч) наблюдение
 * перевешивается (IO заново даёт начальные пересечения).
 */
export function useFeedViewportRead(
  conversationId: string,
  containerRef: RefObject<HTMLElement | null>,
  rows: readonly SeqSource[],
  threadRootId?: string | null,
): void {
  const threadRootIdRef = useRef<string | null>(threadRootId ?? null);
  threadRootIdRef.current = threadRootId ?? null;
  const schedulerRef = useReadReceiptScheduler(conversationId, threadRootIdRef);

  useEffect(() => {
    const container = containerRef.current;
    const scheduler = schedulerRef.current;
    if (!container || !scheduler || typeof IntersectionObserver === 'undefined') return;
    const elSeq = new Map<Element, number>();
    const visibleEls = new Set<Element>();

    /** Решение по живой геометрии: низ каждой пересекающейся строки против
     *  сгиба вьюпорта. */
    const recompute = (): void => {
      const foldBottom = container.getBoundingClientRect().bottom;
      const candidates: { seq: number; bottom: number }[] = [];
      for (const el of visibleEls) {
        const seq = elSeq.get(el);
        if (seq !== undefined) candidates.push({ seq, bottom: el.getBoundingClientRect().bottom });
      }
      const max = maxSeenSeq(candidates, foldBottom);
      wsDebugLog('viewport-read observe:', conversationId, 'maxSeq:', max);
      scheduler.observe(max);
    };

    // Скролл внутри порога не перефирашивает entries частично видимых строк —
    // пересчитываем геометрию и на скролле (passive, rAF-троттл).
    let scrollFrame = 0;
    const onScroll = (): void => {
      if (scrollFrame !== 0) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        recompute();
      });
    };
    container.addEventListener('scroll', onScroll, { passive: true });

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visibleEls.add(entry.target);
          else visibleEls.delete(entry.target);
        }
        recompute();
      },
      { root: container, threshold: 0 },
    );
    for (const row of rows) {
      const el = container.querySelector(`[data-message-id="${CSS.escape(row.id)}"]`);
      if (el) {
        elSeq.set(el, row.seq);
        observer.observe(el);
      }
    }
    // Первичная квитанция при открытии беседы (#254 зомби-бейдж): IO на
    // старте ленты может не дать entries (монтаж при неактивном рендере
    // оболочки) — считаем геометрию видимости напрямую, не дожидаясь.
    const initial = setTimeout(recompute, 350);
    return () => {
      clearTimeout(initial);
      container.removeEventListener('scroll', onScroll);
      if (scrollFrame !== 0) cancelAnimationFrame(scrollFrame);
      observer.disconnect();
    };
  }, [conversationId, rows, containerRef, schedulerRef]);
}
