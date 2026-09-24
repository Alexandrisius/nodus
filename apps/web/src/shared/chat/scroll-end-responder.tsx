import { useEffect, useRef } from 'react';
import { useMessageScroller } from '@nodus/ui/components/message-scroller';

import { useScrollEndStore } from './scroll-end-store.js';

/** ВНУТРИ MessageScrollerProvider: по запросу композера (своя отправка,
 *  пересылка в эту ленту) плавно докручивает ленту до конца — новое сообщение
 *  видно с любой позиции скролла (вердикт 24.09, модель Telegram). */
export function ScrollEndResponder({ scope }: { scope: string }) {
  const { scrollToEnd } = useMessageScroller();
  const nonce = useScrollEndStore((s) => s.nonces[scope] ?? 0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return undefined;
    }
    const raf = requestAnimationFrame(() => {
      scrollToEnd({ behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(raf);
  }, [nonce, scrollToEnd]);
  return null;
}
