import { useEffect, useRef, useState, type RefObject } from 'react';

import { useSelectionStore } from './selection-store.js';

/**
 * РАМОЧНОЕ выделение сообщений (#132, фидбек пилотов) — модель Telegram
 * (исходник webk, src/components/chat/selection.ts, ChatSelection; раунды
 * 6–7):
 *
 * - Старт «НА СТРОКЕ» ИЛИ НА ПУСТОМ МЕСТЕ ленты (поля/фон/аватар/дата-чипы/
 *   подножье ниже последнего сообщения) → рамка после порога 6px, ближайшая
 *   строка выделяется ЦЕЛИКОМ — миллиметра протяжки достаточно (р.7:
 *   пустое место ПОД сообщениями обязано работать — вернуто после
 *   webk-буквализма р.6; у Телеграма пустого низа нет лишь потому, что
 *   лента ЯКОРИТСЯ НИЗОМ — контент растёт снизу вверх, см. Content-примитив).
 * - Контент поверхности (пузырь data-variant / карточка поста) ВНЕ режима
 *   селекта рамкой НЕ является — живут своими жестами (webk verifyTarget);
 *   в РЕЖИМЕ селекта рамка тянется ОТКУДА УГОДНО — включая текст сообщений
 *   (выделение — цветом по data-selected, кружков-отметок больше нет, #151).
 * - Старт НА ТЕКСТЕ (вне режима) → чистое нативное выделение; курсор ВЫШЕЛ
 *   за поверхность → нативное выделение гасится, ЭТО сообщение выделяется
 *   целиком (якорь — точная строка текста), дальше классическая рамка
 *   («выделил текст, вышел за пузырь — выделилось всё сообщение»).
 * - Диапазон — по ИДЕНТИФИКАТОРАМ строк через indexOf по allowed (р.7 —
 *   КРИТИЧНО): MessageScroller ВИРТУАЛИЗИРУЕТ ленту (в DOM — только окно
 *   строк + спейсер); индекс позиции в DOM-списке ≠ индекс в ленте, и
 *   «резинка» красила СОВСЕМ ДРУГИЕ сообщения («выделяю левые внизу»,
 *   р.7). Идентификаторы безразличны к окну/фильтрам DOM.
 * - р.8 (#164, баг-вердикт владельца 30.09): надгробия удалённых —
 *   ОТДЕЛЬНОЕ пространство: под курсором на них рамка не обновляется и
 *   соседние сообщения не втягиваются (selectableRowAt — раньше фильтр
 *   выбираемых заставлял rowAt возвращать живое сообщение ВЫШЕ надгробия);
 *   пустоты ленты (сверху/подножье) работают по р.7 — ближайшая
 *   выбираемая строка.
 * - Дальше «резинка» р.4: непрерывный диапазон между якорем и курсором,
 *   возврат снимает только что выделенное, отпускание ФИКСИРУЕТ в стор
 *   (applySet = union — накопление); подсветка — императивный атрибут
 *   data-box-selected БЕЗ React-рендеров; автоскролл у краёв 7px/кадр;
 *   Esc — отмена; клик после драга глотается (once-listener ТОЛЬКО в
 *   endDrag); touch игнорируется.
 */

/** Порог включения: меньше — обычный клик (или текстовое выделение). */
const DRAG_ENGAGE_PX = 6;
/** Зона автоскролла у краёв и скорость (медленно, как в Telegram). */
const EDGE_AUTOSCROLL_PX = 48;
const EDGE_AUTOSCROLL_STEP_PX = 7;
/** Запас на выход за край поверхности (антиалиасинг/субпиксели). */
const BOUNDARY_SLOP_PX = 2;

/** Старт с этих целей не перехватываем: поля ввода живут своей жизнью. */
const INTERACTIVE_SELECTOR = 'input, textarea, select, [contenteditable="true"]';
const ROW_SELECTOR = '[data-message-id]';
/** Ключ селекта строки (#243): data-message-key (clientMessageId) — стабилен
 *  через замену темпа серверной записью; data-message-id (id записи) меняется. */
const rowKey = (row: HTMLElement): string => row.dataset.messageKey ?? row.dataset.messageId ?? '';
const TEXT_SELECTOR = '[data-slot="message-text"]';
/** Поверхность сообщения — граница «внутри/снаружи» для текста: пузырь
 *  (Bubble-примитив, data-variant) или карточка поста канала. */
const SURFACE_SELECTOR = '[data-variant], [data-slot="post-surface"]';

/** Непрерывный диапазон индексов [min(a,b), max(a,b)] включительно. */
export function sliceRange(orderedIds: readonly string[], a: number, b: number): string[] {
  const from = Math.min(a, b);
  const to = Math.max(a, b);
  const clampedFrom = Math.max(0, from);
  const clampedTo = Math.min(orderedIds.length - 1, to);
  if (clampedTo < clampedFrom) return [];
  return orderedIds.slice(clampedFrom, clampedTo + 1);
}

/**
 * Строка под координатой y (client) — по живым rect: последняя, чей верх
 * выше y. Возвращает САМУ строку (р.7): диапазоны строятся по id через
 * indexOf по ленте — DOM-индексы при виртуализации лгут. Выше первой
 * строки → первая; ниже последней → последняя; строк нет → null.
 */
export function rowAt(rows: readonly HTMLElement[], y: number): HTMLElement | null {
  let found: HTMLElement | null = null;
  for (const row of rows) {
    if (row.getBoundingClientRect().top <= y) found = row;
  }
  // Выше первой строки (нижний якорь ленты — пустота сверху) → первая.
  return found ?? rows[0] ?? null;
}

/**
 * Цель рамки под координатой y — ТОЛЬКО выбираемая строка (р.8, #164:
 * баг-вердикт владельца 30.09 «провожу область по удалённым — выделяется
 * сообщение сверху»): НАДГРОБИЯ — отдельное пространство. Раньше строки
 * рамки фильтровались по выбираемым, и rowAt под курсором на надгробии
 * возвращал ближайшее живое сообщение ВЫШЕ — оно втягивалось в диапазон.
 * Теперь: надгробие под курсором → null (рамка не обновляется, сосед не
 * втягивается); пустоты ленты по р.7 работают — пустота сверху → первая
 * выбираемая, пустое подножье под последней строкой → последняя
 * выбираемая.
 */
export function selectableRowAt(
  rows: readonly HTMLElement[],
  allowedIds: readonly string[],
  y: number,
): HTMLElement | null {
  if (rows.length === 0) return null;
  const allowed = new Set(allowedIds);
  const isSelectable = (row: HTMLElement) => allowed.has(rowKey(row));
  const physical = rowAt(rows, y);
  if (!physical) {
    // Пустота НАД лентой (якорь низа — контент прижат к низу, р.7).
    return rows.find(isSelectable) ?? null;
  }
  if (isSelectable(physical)) return physical;
  const last = rows[rows.length - 1]!;
  if (physical === last && y > last.getBoundingClientRect().bottom) {
    // Пустое подножье ПОД последней строкой (р.7) → последняя выбираемая.
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const row = rows[i]!;
      if (isSelectable(row)) return row;
    }
  }
  return null; // зона надгробия — соседей не втягиваем
}

/** Курсор покинул прямоугольник поверхности (запас на край): выход ЛЮБОЙ
 *  стороной превращает текстовое выделение в выделение всего сообщения. */
export function exitedBoundary(rect: DOMRect, x: number, y: number): boolean {
  return (
    x < rect.left - BOUNDARY_SLOP_PX ||
    x > rect.right + BOUNDARY_SLOP_PX ||
    y < rect.top - BOUNDARY_SLOP_PX ||
    y > rect.bottom + BOUNDARY_SLOP_PX
  );
}

/**
 * Решение старта жеста по цели нажатия (модель webk ChatSelection +
 * р.7-поправки владельца):
 * - 'text' — старт на тексте сообщения: чистое нативное выделение, рамка
 *   включается только при выходе курсора за поверхность;
 * - 'box' — старт «на строке»/на пустом месте ленты (вся не-поверхность)
 *   ИЛИ любой старт в режиме селекта;
 * - 'none' — поля ввода; контент поверхности вне режима селекта (медиа/
 *   мета/реакции); хром ленты вне строк (кнопки/ссылки — стрелка прокрутки
 *   и т.п.).
 */
export function pressKind(target: Element, selectionActive: boolean): 'text' | 'box' | 'none' {
  if (target.closest(INTERACTIVE_SELECTOR)) return 'none';
  // В режиме селекта рамка тянется ОТКУДА УГОДНО (лента select-none —
  // нативного выделения нет, ждать «выхода за пузырь» нечего).
  if (selectionActive) return 'box';
  const row = target.closest(ROW_SELECTOR);
  if (!row) {
    // Пустое место ленты (вне строк) — рамка (р.7); хром-контролы вне
    // строк (стрелка прокрутки, ссылки) — не рамка.
    return target.closest('button, a, [role="button"]') ? 'none' : 'box';
  }
  if (target.closest(TEXT_SELECTOR)) return 'text';
  const surface = target.closest(SURFACE_SELECTOR);
  if (surface && row.contains(surface)) return 'none';
  return 'box';
}

type Phase = 'idle' | 'text' | 'maybe' | 'box';

/**
 * active=true, пока идёт протяжка рамки (лента select-none); состав
 * фиксируется в стор селекта на отпускании. `selectableIds` — живые (не
 * удалённые) id ленты в порядке отображения; `selectionActive` — режим
 * мультивыбора уже включён (рамка тянется откуда угодно, webk-канон).
 */
export function useBoxSelection({
  scope,
  viewportRef,
  selectableIds,
  selectionActive,
}: {
  scope: string;
  viewportRef: RefObject<HTMLElement | null>;
  selectableIds: readonly string[];
  selectionActive: boolean;
}): { active: boolean } {
  const [active, setActive] = useState(false);
  const phaseRef = useRef<Phase>('idle');
  const startRef = useRef({ x: 0, y: 0 });
  const pointerRef = useRef({ x: 0, y: 0 });
  const anchorIdRef = useRef<string | null>(null);
  const markedRef = useRef<Set<string>>(new Set());
  const rowsRef = useRef<HTMLElement[]>([]);
  const scrollRafRef = useRef<number | null>(null);
  const textRef = useRef<{ row: HTMLElement; surface: HTMLElement } | null>(null);
  const allowedRef = useRef(selectableIds);
  allowedRef.current = selectableIds;
  const selectionActiveRef = useRef(selectionActive);
  selectionActiveRef.current = selectionActive;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const collectRows = (): HTMLElement[] =>
      Array.from(viewport.querySelectorAll<HTMLElement>(ROW_SELECTOR));

    /** Цель рамки под курсором: только выбираемая строка (надгробия —
     *  своя зона, р.8; пустоты ленты — р.7). */
    const selectableTarget = (): HTMLElement | null =>
      selectableRowAt(collectRows(), allowedRef.current, pointerRef.current.y);

    /** Живая «резинка»: диапазон по ИД строки-якоря и строки под курсором
     *  (indexOf по ленте — окно DOM не важно, р.7). */
    const paintRange = (fromId: string, toId: string) => {
      const from = allowedRef.current.indexOf(fromId);
      const to = allowedRef.current.indexOf(toId);
      if (from < 0 || to < 0) return;
      const rows = collectRows();
      rowsRef.current = rows;
      const ids = new Set(sliceRange(allowedRef.current, from, to));
      for (const row of rows) {
        const id = rowKey(row);
        const should = ids.has(id);
        const has = row.getAttribute('data-box-selected') === 'true';
        if (should && !has) row.setAttribute('data-box-selected', 'true');
        else if (!should && has) row.removeAttribute('data-box-selected');
      }
      markedRef.current = ids;
    };

    const clearPaint = () => {
      for (const row of rowsRef.current) row.removeAttribute('data-box-selected');
      rowsRef.current = [];
      markedRef.current = new Set();
    };

    const swallowNextClick = () => {
      const swallow = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
      };
      window.addEventListener('click', swallow, { capture: true, once: true });
    };

    const stopAutoscroll = () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };

    /** Медленный автоскролл у краёв: строки текут под курсором, диапазон
     *  пересчитывается каждый кадр (по id — без пропусков). */
    const autoscrollTick = () => {
      if (phaseRef.current !== 'box') {
        scrollRafRef.current = null;
        return;
      }
      const r = viewport.getBoundingClientRect();
      let dy = 0;
      if (pointerRef.current.y < r.top + EDGE_AUTOSCROLL_PX) dy = -EDGE_AUTOSCROLL_STEP_PX;
      else if (pointerRef.current.y > r.bottom - EDGE_AUTOSCROLL_PX) dy = EDGE_AUTOSCROLL_STEP_PX;
      if (dy === 0) {
        scrollRafRef.current = null;
        return;
      }
      viewport.scrollTop += dy;
      if (phaseRef.current === 'box' && anchorIdRef.current !== null) {
        const row = selectableTarget();
        if (row) paintRange(anchorIdRef.current, rowKey(row));
      }
      scrollRafRef.current = requestAnimationFrame(autoscrollTick);
    };

    const kickAutoscroll = () => {
      if (scrollRafRef.current === null) {
        scrollRafRef.current = requestAnimationFrame(autoscrollTick);
      }
    };

    const engageBox = (anchorId: string) => {
      if (allowedRef.current.indexOf(anchorId) < 0) return;
      phaseRef.current = 'box';
      setActive(true);
      anchorIdRef.current = anchorId;
      paintRange(anchorId, anchorId);
    };

    const endDrag = (commit: boolean) => {
      const wasBox = phaseRef.current === 'box';
      phaseRef.current = 'idle';
      textRef.current = null;
      stopAutoscroll();
      setActive(false);
      if (!wasBox) return;
      const ids = commit ? Array.from(markedRef.current) : [];
      // Императивную подсветку снимаем ПОСЛЕ фиксации в стор: React
      // перерендерит те же строки с data-selected — без мигания.
      if (commit && ids.length > 0) useSelectionStore.getState().applySet(scope, ids);
      clearPaint();
      // Глотание клика после драга — ТОЛЬКО ЗДЕСЬ (once-listener): вторая
      // регистрация при включении рамки оставляла «заряжённый» листener,
      // съедавший следующий ЛЕГИТИМНЫЙ клик (раунд 5).
      swallowNextClick();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || event.pointerType === 'touch' || phaseRef.current !== 'idle') {
        return;
      }
      const target = event.target as Element | null;
      if (!target?.closest) return;
      const viewportRect = viewport.getBoundingClientRect();
      // Скроллбары не запускают протяжку.
      if (
        event.clientX > viewportRect.left + viewport.clientWidth ||
        event.clientY > viewportRect.top + viewport.clientHeight
      ) {
        return;
      }
      const kind = pressKind(target, selectionActiveRef.current);
      startRef.current = { x: event.clientX, y: event.clientY };
      pointerRef.current = { x: event.clientX, y: event.clientY };
      if (kind === 'none') return;
      if (kind === 'text') {
        const row = target.closest<HTMLElement>(ROW_SELECTOR);
        const surface = target.closest<HTMLElement>(SURFACE_SELECTOR);
        if (!row || !surface || !row.contains(surface)) return;
        textRef.current = { row, surface };
        phaseRef.current = 'text';
        return;
      }
      phaseRef.current = 'maybe';
    };

    const onPointerMove = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
      const phase = phaseRef.current;
      if (phase === 'idle') return;

      if (phase === 'text') {
        const text = textRef.current;
        if (!text) {
          phaseRef.current = 'idle';
          return;
        }
        if (!exitedBoundary(text.surface.getBoundingClientRect(), event.clientX, event.clientY)) {
          return;
        }
        // Выход за поверхность (модель Telegram): нативное выделение гасим,
        // рамка включается ЦЕЛИКОМ на сообщении текста — якорь ТОЧНАЯ
        // строка этого сообщения, а не строка под курсором.
        window.getSelection()?.removeAllRanges();
        const anchorId = rowKey(text.row);
        textRef.current = null;
        engageBox(anchorId);
        return;
      }

      if (phase === 'maybe') {
        const { x: sx, y: sy } = startRef.current;
        if (Math.hypot(event.clientX - sx, event.clientY - sy) < DRAG_ENGAGE_PX) return;
        const row = selectableTarget();
        if (!row) return;
        engageBox(rowKey(row));
        return;
      }

      const row = selectableTarget();
      if (row && anchorIdRef.current !== null) {
        paintRange(anchorIdRef.current, rowKey(row));
      }
      kickAutoscroll();
    };

    const onPointerUp = () => endDrag(true);
    const onPointerCancel = () => endDrag(true);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || phaseRef.current !== 'box') return;
      endDrag(false);
    };

    /** Ручная прокрутка (колесо) во время протяжки: строки уехали под
     *  курсором — «резинка» пересчитывается по id, без пропусков. */
    const onFeedScroll = () => {
      if (phaseRef.current !== 'box' || anchorIdRef.current === null) return;
      const row = selectableTarget();
      if (row) paintRange(anchorIdRef.current, rowKey(row));
    };

    viewport.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('keydown', onKeyDown);
    viewport.addEventListener('scroll', onFeedScroll);
    return () => {
      viewport.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('keydown', onKeyDown);
      viewport.removeEventListener('scroll', onFeedScroll);
      stopAutoscroll();
    };
  }, [scope, viewportRef]);

  return { active };
}
