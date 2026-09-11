import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { NodeEdgePoint } from '@nodus/ui/components/node-edge';
import { pathLength } from '@nodus/ui/components/node-edge';

import { flashFadeMs, threadLinkPoints, threadLinkSource } from './channel-layout.js';

export interface ThreadLinkState {
  points: NodeEdgePoint[];
  pinned: boolean;
}

function sameLink(a: ThreadLinkState | null, b: ThreadLinkState | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.pinned === b.pinned &&
    a.points.length === b.points.length &&
    a.points.every((p, i) => p.x === b.points[i]?.x && p.y === b.points[i]?.y)
  );
}

/**
 * Связь «пост → тред» и вспышка поверх неё (грамматика — circuit.md):
 * статичное ребро (структура) + вспышка-событие на смену открытого треда
 * (открытие, переключение, deep-link). Вынесено из channel-view.tsx как
 * отдельная ответственность (I5: «лимит ответственности важнее лимита
 * строк»).
 *
 * Геометрия — живые rect: замер ПОСЛЕ вталкивания окна (settle 240 мс —
 * transition ширины осел; посты ленты приходят с данными позже маунта,
 * MSW ~400 мс), далее ребро следует за постом при скролле ленты и за окном
 * при transition ширины и императивном drag перегородки (transition-событий
 * в drag нет — покадровый rAF-цикл). Bail-out по неизменной снапнутой
 * геометрии: скролл/drag не ре-рендерят дерево канала ради SVG-линии
 * (react-best-practices: часто меняющиеся DOM-значения — не state-шторм).
 *
 * Арминг вспышки — ОТДЕЛЬНЫЙ эффект с deps только по треду: в dev StrictMode
 * двойной прогон эффекта с веткой «уже армлено» снимал settle-таймаут
 * cleanup'ом первого прогона — вспышка «залипала» до первого ручного события
 * (gotchas, подтверждено React docs + пробой, issue #42).
 */
export function useThreadLink({
  containerRef,
  paneRef,
  threadRootId,
  side,
  containerW,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  paneRef: RefObject<HTMLDivElement | null>;
  threadRootId: string | null;
  side: boolean;
  /** живая ширина контейнера: ресайз (в т.ч. тоггл панели беседы) двигает
   *  кромку окна без transition — перемереживание по deps, иначе порт
   *  отрывается от окна (вердикт валидатора #42, раунд 2). */
  containerW: number;
}) {
  const [link, setLink] = useState<ThreadLinkState | null>(null);
  const [flash, setFlash] = useState<{ points: NodeEdgePoint[]; fadeMs: number } | null>(null);
  const [flashRun, setFlashRun] = useState(0);
  const flashTimer = useRef(0);
  const threadRef = useRef(threadRootId);
  threadRef.current = threadRootId;
  const sideRef = useRef(side);
  sideRef.current = side;
  const pendingFlash = useRef(false);
  const sigAt = useRef(0);

  const measureLink = useCallback((): ThreadLinkState | null => {
    const container = containerRef.current;
    const paneEl = paneRef.current;
    const id = threadRef.current;
    if (!container || !paneEl || !id || !sideRef.current) return null;
    const sourceEl = container.querySelector(`[data-thread-source="${id}"]`);
    const feedEl = container.querySelector('[data-feed-scroll]');
    if (!sourceEl || !feedEl) return null;
    const sRect = sourceEl.getBoundingClientRect();
    const fRect = feedEl.getBoundingClientRect();
    // Источник — ось строки действий поста или кромка ленты (pinned): связь
    // не прячется при скролле, а обрывается на кромке (вердикт владельца).
    const src = threadLinkSource(sRect, fRect);
    const cRect = container.getBoundingClientRect();
    // portX — viewport-АБСОЛЮТНЫЙ левый край окна треда: локальным его
    // делает threadLinkPoints (двойной вычет однажды увёл порт в середину
    // ленты, вердикт валидатора #42).
    const portX = paneEl.getBoundingClientRect().left;
    return {
      points: threadLinkPoints(
        { x: sRect.right, y: src.y, pinned: src.pinned },
        { left: cRect.left, top: cRect.top },
        portX,
      ),
      pinned: src.pinned !== null,
    };
  }, [containerRef, paneRef]);

  const remeasure = useCallback(() => {
    const next = measureLink();
    setLink((prev) => (sameLink(prev, next) ? prev : next));
    if (!next || !pendingFlash.current) return;
    if (performance.now() - sigAt.current < 220) return;
    pendingFlash.current = false;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const fadeMs = flashFadeMs(pathLength(next.points));
    window.clearTimeout(flashTimer.current);
    setFlash({ points: next.points, fadeMs });
    setFlashRun((k) => k + 1);
    flashTimer.current = window.setTimeout(() => setFlash(null), fadeMs);
  }, [measureLink]);

  // Resize контейнера/смена режима двигают ленту и окно — связь перемеряется.
  useEffect(() => {
    remeasure();
  }, [containerW, side, remeasure]);

  // Перемереживание связи: скролл ленты (capture), любые DOM-изменения
  // контейнера (MutationObserver: посты монтируются с данными позже маунта —
  // без этого связь оставалась бы null до первого скролла), resize и
  // покадрово во время transition ширины окна (фильтр propertyName — иначе
  // цикл гаснет по transitionend посторонних анимаций, gotchas).
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let raf = 0;
    let loop = 0;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        remeasure();
      });
    };
    const onTransitionRun = (e: TransitionEvent) => {
      if (e.propertyName !== 'width' || loop) return;
      const tick = () => {
        remeasure();
        loop = requestAnimationFrame(tick);
      };
      loop = requestAnimationFrame(tick);
    };
    const onTransitionEnd = (e: TransitionEvent) => {
      if (e.propertyName !== 'width') return;
      cancelAnimationFrame(loop);
      loop = 0;
      remeasure();
    };
    const mo = new MutationObserver(schedule);
    mo.observe(el, { childList: true, subtree: true });
    el.addEventListener('scroll', schedule, { capture: true, passive: true });
    el.addEventListener('transitionrun', onTransitionRun, true);
    el.addEventListener('transitionend', onTransitionEnd, true);
    el.addEventListener('transitioncancel', onTransitionEnd, true);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      cancelAnimationFrame(loop);
      mo.disconnect();
      el.removeEventListener('scroll', schedule, { capture: true });
      el.removeEventListener('transitionrun', onTransitionRun, true);
      el.removeEventListener('transitionend', onTransitionEnd, true);
      el.removeEventListener('transitioncancel', onTransitionEnd, true);
    };
  }, [containerRef, remeasure]);

  // Императивный drag перегородки: transition-событий НЕТ (ширину ставит
  // el.style.width) — связь перемеряется покадрово, иначе порт отрывается от
  // кромки окна треда (вердикт владельца).
  useEffect(() => {
    if (!side) return;
    let raf = 0;
    let live = false;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest('[role="separator"]')) return;
      live = true;
      const tick = () => {
        if (!live) return;
        remeasure();
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    const onPointerUp = () => {
      live = false;
      cancelAnimationFrame(raf);
    };
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    // pointercancel (touch/pen, перехват жеста) гасит цикл так же, иначе
    // rAF-луп живёт до случайного pointerup (вердикт валидатора #42).
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      live = false;
      cancelAnimationFrame(raf);
      el.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [containerRef, remeasure, side]);

  useEffect(() => {
    if (!threadRootId) {
      pendingFlash.current = false;
      setLink(null);
      return;
    }
    sigAt.current = performance.now();
    pendingFlash.current = true;
    const settle = window.setTimeout(remeasure, 240);
    return () => window.clearTimeout(settle);
  }, [remeasure, threadRootId]);

  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  return { link, flash, flashRun };
}
