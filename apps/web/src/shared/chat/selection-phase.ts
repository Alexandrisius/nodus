import { useEffect, useRef, useState } from 'react';

import type { ComposerSelection } from './chat-composer.js';

/**
 * Морфология островка при мультивыборе (chat-composer, канон раундов 9–10,
 * вынесено из chat-composer.tsx — I5, #177): sel — узкий батч-островок;
 * exit — ширина уже полная (transition ведёт 288px→100% при mx-auto =
 * симметрично от центра), тулбар внутри до конца фазы; normal — облако ввода.
 * Смена фазы на СЕРЕДИНЕ расширения (140 из 200 мс ширины) — тулбар уже
 * растворился (composer-hide 120 мс), новый контент проявляется до конца
 * роста: один кроссфейд (баг-вердикт раунда 10).
 */
export function useSelectionPhase(sel: ComposerSelection | null): {
  selPhase: 'normal' | 'sel' | 'exit';
  toolbarSel: ComposerSelection | null;
} {
  const [selPhase, setSelPhase] = useState<'normal' | 'sel' | 'exit'>('normal');
  const lastSel = useRef<ComposerSelection | null>(null);
  useEffect(() => {
    if (sel) {
      lastSel.current = sel;
      setSelPhase('sel');
      return undefined;
    }
    setSelPhase((p) => (p === 'sel' ? 'exit' : p));
    return undefined;
  }, [sel]);
  useEffect(() => {
    if (selPhase !== 'exit') return undefined;
    const timer = window.setTimeout(() => setSelPhase('normal'), 140);
    return () => window.clearTimeout(timer);
  }, [selPhase]);
  const toolbarSel = selPhase === 'sel' ? sel : lastSel.current;
  return { selPhase, toolbarSel };
}
