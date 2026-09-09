import { useCallback, useRef, useState, type PointerEvent } from 'react';

const STORE_KEY = 'nodus-card-chat-w-v1';
const DEFAULT_W = 560;
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
  const widthRef = useRef(chatW);
  widthRef.current = chatW;

  const onDividerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startW = widthRef.current;
    const onMove = (ev: globalThis.PointerEvent) => {
      setChatW(clamp(startW + (startX - ev.clientX)));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      localStorage.setItem(STORE_KEY, String(widthRef.current));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  return { chatW, onDividerDown };
}
