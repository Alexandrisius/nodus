import { useEffect, useLayoutEffect, useRef } from 'react';

import { displayCaretOffset } from './composer-mentions.js';

/**
 * Кастомная каретка композера упоминаний (#224, ревизия приёмки): сырые
 * глифы поля прозрачны (зеркальный оверлей рисует чипы) — нативная каретка
 * в хвосте `](user:uuid)` стояла «в пустоте» далеко правее видимого чипа.
 * Поле прячет нативную каретку (caret-transparent), этот слой рисует свою
 * по ЗАЕРКАЛУ: позиция измеряется Range-ом по текстовым узлам зеркала
 * (метрика 1:1 с полем), смещения невидимого хвоста токена ремапятся к
 * правому краю чипа (displayCaretOffset) — каретка «сразу за чипом».
 *
 * Скрытия: расфокус/выделение/IME-композиция — каретку рисует visible=false.
 */

interface CaretInfo {
  /** Сырое смещение selectionStart поля (ремап внутри). */
  offset: number;
  /** Фокус + свёрнутая селекция + не композиция. */
  visible: boolean;
}

/** Позиция каретки в координатах контейнера (или null — измерить нельзя). */
function caretRect(
  mirror: HTMLElement,
  text: string,
  rawOffset: number,
): { left: number; top: number; height: number } | null {
  const walker = document.createTreeWalker(mirror, NodeFilter.SHOW_TEXT);
  const target = displayCaretOffset(text, Math.min(rawOffset, text.length));
  let consumed = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const value = node.nodeValue ?? '';
    if (consumed + value.length >= target) {
      const range = document.createRange();
      range.setStart(node, target - consumed);
      range.setEnd(node, target - consumed);
      // jsdom не реализует Range-геометрию — каретка визуальный слой,
      // без rects (тесты) просто скрыта.
      if (typeof range.getBoundingClientRect !== 'function') return null;
      const rect = range.getBoundingClientRect();
      // Свёрнутый range в пустой строке может отдать нулевой rect — берём
      // родительский line-box.
      const fallback = node.parentElement?.getBoundingClientRect();
      const box = rect.height > 0 ? rect : (fallback ?? null);
      const host = mirror.parentElement;
      if (!box || !host) return null;
      const hostBox = host.getBoundingClientRect();
      return {
        left: box.left - hostBox.left,
        top: box.top - hostBox.top,
        height: box.height > 0 ? box.height : 20,
      };
    }
    consumed += value.length;
  }
  return null;
}

/** Слой каретки: absolute в общей relative-обёртке поля (рядом с зеркалом). */
export function ComposerCaret({
  text,
  caret,
  mirrorRef,
}: {
  text: string;
  caret: CaretInfo | null;
  mirrorRef: { current: HTMLDivElement | null };
}) {
  const elRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = elRef.current;
    const mirror = mirrorRef.current;
    if (!el || !mirror) return;
    if (!caret?.visible) {
      el.style.opacity = '0';
      return;
    }
    const rect = caretRect(mirror, text, caret.offset);
    if (!rect) {
      el.style.opacity = '0';
      return;
    }
    el.style.left = `${rect.left}px`;
    el.style.top = `${rect.top}px`;
    el.style.height = `${rect.height}px`;
    el.style.opacity = '1';
  }, [text, caret, mirrorRef]);

  // Скролл длинного поля двигает зеркало — каретка едет с ним (viewport-
  // координаты rect меняются, пересчитываем).
  useEffect(() => {
    const mirror = mirrorRef.current;
    if (!mirror) return;
    const rerender = () => {
      const el = elRef.current;
      if (!el || !caret?.visible) return;
      const rect = caretRect(mirror, text, caret.offset);
      if (rect) {
        el.style.left = `${rect.left}px`;
        el.style.top = `${rect.top}px`;
      }
    };
    mirror.addEventListener('scroll', rerender);
    window.addEventListener('resize', rerender);
    return () => {
      mirror.removeEventListener('scroll', rerender);
      window.removeEventListener('resize', rerender);
    };
  }, [text, caret, mirrorRef]);

  return (
    <div
      ref={elRef}
      aria-hidden
      className="pointer-events-none absolute z-10 w-px bg-foreground animate-[caret-blink_1.1s_step-end_infinite]"
      style={{ opacity: 0 }}
    />
  );
}
