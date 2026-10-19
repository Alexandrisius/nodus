import { useCallback, useState, type PointerEvent, type RefObject } from 'react';

import {
  BRANCH_DEFAULT_W,
  BRANCH_MIN_W,
  branchMaxWidth,
  clampBranchWidth,
} from './task-card-layout.js';

const STORE_KEY = 'nodus-task-branch-w-v1';

function readStored(): number {
  const stored = Number(localStorage.getItem(STORE_KEY));
  return Number.isFinite(stored) && stored >= BRANCH_MIN_W ? stored : BRANCH_DEFAULT_W;
}

/**
 * Ширина навигатора ветки карточки задачи с перегородкой и памятью (#365) —
 * механика `use-chat-width`: drag ИМПЕРАТИВНЫЙ (style.width в rAF, React не
 * рендерит карточку во время тяги), коммит state + localStorage на pointerup;
 * память одна на все карточки задач. Навигатор — тоже сужение ряда, его
 * ширину отдаёт колонка чата (канон #63): в каждом кадре drag чат получает
 * ширину по той же формуле, что и в рендере (`chatWidthFor`) — центральная
 * колонка стоит, пока чат не упрётся в пол. Формулу и пол чата карточка
 * передаёт в момент нажатия (актуальные на старт тяги). Предел тяги — замер
 * ряда на старте (событие, не ResizeObserver): половина ряда и минимум центра.
 * Двойной клик по перегородке — дефолтная ширина.
 */
export interface BranchDragChat {
  /** Пол колонки чата (центру остаётся ряд − навигатор − пол). */
  floor: number;
  /** Ширина колонки чата при данной ширине навигатора (формула рендера). */
  widthFor: (branchW: number) => number;
}

export function useBranchWidth({
  rowRef,
  branchRef,
  chatRef,
}: {
  rowRef: RefObject<HTMLDivElement | null>;
  branchRef: RefObject<HTMLDivElement | null>;
  chatRef: RefObject<HTMLDivElement | null>;
}) {
  const [branchW, setBranchW] = useState(readStored);
  const [dragging, setDragging] = useState(false);

  const onDividerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>, chatGeometry: BranchDragChat) => {
      const branch = branchRef.current;
      const row = rowRef.current;
      if (event.button !== 0 || !branch || !row) return;
      event.preventDefault();
      const startX = event.clientX;
      // Старт — от ОТРИСОВАННОЙ ширины: в узком окне flex мог ужать навигатор
      // ниже запомненной, тяга от памяти дала бы скачок на первом пикселе.
      const startW = branch.getBoundingClientRect().width;
      const maxW = branchMaxWidth(row.getBoundingClientRect().width, chatGeometry.floor);
      let latest = clampBranchWidth(startW, maxW);
      let raf = 0;
      setDragging(true);
      const onMove = (ev: globalThis.PointerEvent) => {
        // Перегородка СПРАВА от навигатора: вправо — шире.
        latest = clampBranchWidth(startW + (ev.clientX - startX), maxW);
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          branch.style.width = `${latest}px`;
          const chat = chatRef.current;
          if (chat) chat.style.width = `${chatGeometry.widthFor(latest)}px`;
        });
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        if (raf) cancelAnimationFrame(raf);
        setDragging(false);
        setBranchW(latest);
        localStorage.setItem(STORE_KEY, String(latest));
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [branchRef, chatRef, rowRef],
  );

  const onDividerReset = useCallback(() => {
    setBranchW(BRANCH_DEFAULT_W);
    localStorage.removeItem(STORE_KEY);
  }, []);

  return { branchW, dragging, onDividerDown, onDividerReset };
}
