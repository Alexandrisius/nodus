import { useEffect, useRef } from 'react';
import { useMessageScroller } from '@nodus/ui/components/message-scroller';

import { useScrollEndStore } from './scroll-end-store.js';

/** ВНУТРИ MessageScrollerProvider: по запросу композера (своя отправка,
 *  пересылка в эту ленту) докручивает ленту до конца — новое сообщение видно
 *  с любой позиции скролла (вердикт 24.09, модель Telegram). Поведение — из
 *  запроса: одиночная отправка плавная, серия — мгновенная (раунд 3). */
export function ScrollEndResponder({ scope }: { scope: string }) {
  const { scrollToEnd } = useMessageScroller();
  const request = useScrollEndStore((s) => s.requests[scope]);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return undefined;
    }
    if (!request) return undefined;
    const raf = requestAnimationFrame(() => {
      scrollToEnd({ behavior: request.behavior });
    });
    return () => cancelAnimationFrame(raf);
  }, [request, scrollToEnd]);
  return null;
}
