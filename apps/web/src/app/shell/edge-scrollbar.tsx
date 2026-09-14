import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { cn } from '@nodus/ui/lib/utils';

const THUMB_MIN = 40;
const TRACK_W = 8; // щель периметра справа (mr-2 служебной полосы)
const THUMB_W = 4;

function metrics(el: HTMLElement) {
  const total = el.scrollHeight;
  const view = el.clientHeight;
  return { total, view, overflow: total > view + 1 };
}

/**
 * Ползунок прокрутки страницы — В ПРАВОЙ ЩЕЛИ ПЕРИМЕТРА (правее служебной
 * полосы с аватарками), трек — НА ВСЮ ВЫСОТУ ЭКРАНА, хотя управляет он
 * скроллером страницы внутри мягкой рамы (вердикт владельца 14.09.2026
 * ночью: «там как раз есть место справа от аватарок»). Нативный вертикальный
 * скроллбар управляемого скроллера скрыт атрибутом `data-edge-scroll`
 * (globals.css; горизонтальный для широких таблиц остаётся); ползунок —
 * оверлей 4px в тон `--scrollbar`, ярче при перетаскивании.
 *
 * Механика: нативный скроллбар нельзя отрисовать вне его контейнера, поэтому
 * ползунок — свой: шелл «усыновляет» главный вертикальный скроллер страницы
 * (самый большой прокручиваемый элемент внутри #content; узкие панели вроде
 * списка бесед и колонок канбана не подходят по площади), слушает его scroll
 * и ResizeObserver контента; прокрутка любой другой подходящей области
 * внутри #content усыновляет её на лету. Drag ползунка и клик по треку пишут
 * scrollTop усыновлённого скроллера.
 */
export function EdgeScrollbar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const scrollerRef = useRef<HTMLElement | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const dragRef = useRef<{ startY: number; startScroll: number } | null>(null);
  const [view, setView] = useState({ thumb: 0, top: 0, visible: false });
  const [dragging, setDragging] = useState(false);

  const sync = useCallback(() => {
    const el = scrollerRef.current;
    const {
      total,
      view: client,
      overflow,
    } = el ? metrics(el) : { total: 0, view: 0, overflow: false };
    if (!el || !overflow) {
      setView((s) => (s.visible ? { thumb: 0, top: 0, visible: false } : s));
      return;
    }
    const track = window.innerHeight;
    const thumb = Math.max(THUMB_MIN, (client / total) * track);
    const top = (el.scrollTop / (total - client)) * (track - thumb);
    setView({ thumb, top, visible: true });
  }, []);

  const adopt = useCallback(
    (el: HTMLElement | null) => {
      const prev = scrollerRef.current;
      if (el === prev) return;
      if (prev) {
        delete prev.dataset.edgeScroll;
        prev.removeEventListener('scroll', sync);
      }
      roRef.current?.disconnect();
      roRef.current = null;
      scrollerRef.current = el;
      if (el) {
        el.dataset.edgeScroll = 'true';
        el.addEventListener('scroll', sync, { passive: true });
        // Контент растёт (данные догружаются) без изменения коробки скроллера —
        // следим за его первым ребенком: длина ползунка остаётся честной.
        const child = el.firstElementChild;
        if (child) {
          roRef.current = new ResizeObserver(sync);
          roRef.current.observe(child);
        }
      }
      sync();
    },
    [sync],
  );

  /** Главный скроллер страницы: самый большой по площади прокручиваемый
   *  элемент внутри #content (узкие панели — список бесед, колонки канбана —
   *  не «страница» и ползунка периметра не получают). */
  const pick = useCallback(() => {
    const content = document.getElementById('content');
    if (!content) {
      adopt(null);
      return;
    }
    const cr = content.getBoundingClientRect();
    let best: HTMLElement | null = null;
    let bestArea = 0;
    for (const el of content.querySelectorAll<HTMLElement>('*')) {
      if (!/(auto|scroll)/.test(getComputedStyle(el).overflowY)) continue;
      if (!metrics(el).overflow) continue;
      const r = el.getBoundingClientRect();
      if (r.height < cr.height * 0.7 || r.width < cr.width * 0.6) continue;
      const area = r.width * r.height;
      if (area > bestArea) {
        bestArea = area;
        best = el;
      }
    }
    adopt(best);
  }, [adopt]);

  // Прокрутили другую подходящую область внутри контента — усыновляем её.
  useEffect(() => {
    const onScroll = (event: Event) => {
      const target = event.target;
      const content = document.getElementById('content');
      if (!(target instanceof HTMLElement) || !content?.contains(target)) return;
      if (target === scrollerRef.current) {
        sync();
        return;
      }
      const cr = content.getBoundingClientRect();
      const r = target.getBoundingClientRect();
      if (r.height < cr.height * 0.7 || r.width < cr.width * 0.6) return;
      if (/(auto|scroll)/.test(getComputedStyle(target).overflowY) && metrics(target).overflow) {
        adopt(target);
      }
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => document.removeEventListener('scroll', onScroll, true);
  }, [adopt, sync]);

  // Смена маршрута/размера/догрузка данных — пересбор кандидата и геометрии.
  useEffect(() => {
    pick();
    const t1 = window.setTimeout(pick, 300);
    const t2 = window.setTimeout(pick, 1200);
    window.addEventListener('resize', sync);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener('resize', sync);
    };
  }, [pathname, searchStr, pick, sync]);

  useEffect(() => () => roRef.current?.disconnect(), []);

  function scrollByFraction(fraction: number) {
    const el = scrollerRef.current;
    if (!el) return;
    const { total, view: client } = metrics(el);
    el.scrollTop = fraction * (total - client);
  }

  function onThumbDown(event: React.PointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    event.preventDefault();
    const el = scrollerRef.current;
    if (!el) return;
    dragRef.current = { startY: event.clientY, startScroll: el.scrollTop };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onThumbMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const el = scrollerRef.current;
    if (!drag || !el) return;
    const { total, view: client } = metrics(el);
    const track = window.innerHeight;
    const thumb = Math.max(THUMB_MIN, (client / total) * track);
    const delta = ((event.clientY - drag.startY) / (track - thumb)) * (total - client);
    el.scrollTop = drag.startScroll + delta;
  }

  function onThumbUp(event: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = null;
    setDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function onTrackDown(event: React.PointerEvent<HTMLDivElement>) {
    // Клик по треку мимо ползунка — прыжок страницей к месту клика.
    const track = window.innerHeight;
    scrollByFraction((event.clientY - view.thumb / 2) / (track - view.thumb));
  }

  if (!view.visible) return null;
  return (
    <div
      role="scrollbar"
      aria-orientation="vertical"
      aria-controls="content"
      className="fixed inset-y-0 right-0 z-40"
      style={{ width: TRACK_W }}
      onPointerDown={onTrackDown}
    >
      <div
        onPointerDown={onThumbDown}
        onPointerMove={onThumbMove}
        onPointerUp={onThumbUp}
        onPointerCancel={onThumbUp}
        className={cn(
          'absolute rounded-full transition-colors',
          dragging ? 'bg-foreground/40' : 'bg-[var(--scrollbar)] hover:bg-foreground/30',
        )}
        style={{
          width: THUMB_W,
          right: (TRACK_W - THUMB_W) / 2,
          height: view.thumb,
          transform: `translateY(${view.top}px)`,
        }}
      />
    </div>
  );
}
