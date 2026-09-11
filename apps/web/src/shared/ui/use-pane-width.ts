import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';

/** Кламп ширины панели: не уже minW и не шире maxW (maxW уже minW — degenerate
 *  контейнер — остаётся minW). */
export function clampPaneWidth(width: number, minW: number, maxW: number): number {
  return Math.min(Math.max(width, minW), Math.max(maxW, minW));
}

/**
 * Ширина вталкиваемой панели с перегородкой, тянущейся мышью, и памятью
 * localStorage (канон use-chat-width: drag ИМПЕРАТИВНЫЙ — el.style.width в
 * rAF, React не рендерит дерево во время тяги; коммит state + память на
 * pointerup). От use-chat-width отличается отсутствием shrink/floor панели
 * «О задаче» и собственным ключом памяти: окно треда канала помнит свою
 * ширину отдельно от колонки чата карточек.
 *
 * @param paneRef — панель, которой drag выставляет ширину напрямую;
 * @param maxW — живой верхний предел (сузился контейнер — сузился предел).
 */
export function usePaneWidth({
  storeKey,
  defaultW,
  minW,
  maxW,
  paneRef,
}: {
  storeKey: string;
  defaultW: number;
  minW: number;
  maxW: number;
  paneRef: RefObject<HTMLDivElement | null>;
}) {
  const [width, setWidth] = useState(() => {
    const stored = Number(localStorage.getItem(storeKey));
    return Number.isFinite(stored) && stored >= minW ? stored : defaultW;
  });
  const [dragging, setDragging] = useState(false);
  const widthRef = useRef(width);
  widthRef.current = width;
  const maxRef = useRef(maxW);
  maxRef.current = maxW;

  // Контейнер сузился — запомненная ширина клампится новым живым пределом:
  // drag стартует от ЭФФЕКТИВНОЙ ширины (рендер и старт тяги совпадают),
  // скачка на первом пикселе и сжатия ленты ниже минимума нет (вердикт
  // валидатора #42).
  useEffect(() => {
    setWidth((w) => clampPaneWidth(w, minW, maxW));
  }, [maxW, minW]);

  const onDividerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startW = widthRef.current;
      let latest = startW;
      let raf = 0;
      setDragging(true);
      const onMove = (ev: globalThis.PointerEvent) => {
        // Перегородка СЛЕВА от панели: влево — шире (та же ориентация, что
        // у колонки чата карточки).
        latest = clampPaneWidth(startW + (startX - ev.clientX), minW, maxRef.current);
        // Не чаще одного кадра (pointermove идёт плотнее refresh rate).
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          const el = paneRef.current;
          if (el) el.style.width = `${latest}px`;
        });
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        if (raf) cancelAnimationFrame(raf);
        setDragging(false);
        setWidth(latest);
        localStorage.setItem(storeKey, String(latest));
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      // pointercancel (touch/pen, перехват жеста): drag гаснет как pointerup,
      // иначе dragging/слушатели живут до случайного pointerup и коммитят
      // устаревшую ширину (вердикт валидатора #42).
      window.addEventListener('pointercancel', onUp);
    },
    [minW, paneRef, storeKey],
  );

  return { width, onDividerDown, dragging };
}
