import { useCallback, useRef, useState, type PointerEvent } from 'react';

const STORE_KEY = 'nodus-card-chat-w-v1';
const DEFAULT_W = 680;
const MIN_W = 420;
/** Доля вьюпорта: чат может стать главным, но не выжать содержание целиком. */
const MAX_RATIO = 0.66;

function clamp(width: number) {
  return Math.min(Math.max(width, MIN_W), Math.round(window.innerWidth * MAX_RATIO));
}

/**
 * Ширина колонки обсуждения в карточке: тянется за разделитель мышью
 * (как сплит в IDE), сохраняется в localStorage — каждый настраивает баланс
 * «содержание/чат» под себя, дефолт 560px.
 */
export function useCardChatWidth() {
  const [chatW, setChatW] = useState(() => {
    const stored = Number(localStorage.getItem(STORE_KEY));
    return Number.isFinite(stored) && stored >= MIN_W ? clamp(stored) : DEFAULT_W;
  });
  /** Идёт ручной drag: пока true, transition на ширине чата СНЯТ —
   *  transitions только для программных toggle (панель «О задаче»), никогда
   *  при ручном ресайзе, иначе догоняющая анимация = фризы (gotchas). */
  const [dragging, setDragging] = useState(false);
  const widthRef = useRef(chatW);
  widthRef.current = chatW;

  const onDividerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startW = widthRef.current;
    let latest = startW;
    let raf = 0;
    setDragging(true);
    const onMove = (ev: globalThis.PointerEvent) => {
      latest = clamp(startW + (startX - ev.clientX));
      // Не чаще одного рендера на кадр: pointermove может идти плотнее
      // refresh rate — лишние setState = лишние relayout сетки (I4).
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setChatW(latest);
      });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (raf) cancelAnimationFrame(raf);
      setDragging(false);
      setChatW(latest);
      localStorage.setItem(STORE_KEY, String(latest));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  return { chatW, onDividerDown, dragging };
}
