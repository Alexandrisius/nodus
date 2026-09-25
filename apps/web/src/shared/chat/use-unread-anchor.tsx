import { useEffect, useRef } from 'react';
import { useMessageScroller } from '@nodus/ui/components/message-scroller';

import type { ChatMessage } from '@nodus/contracts';

/**
 * Якорь «открыть на первом непрочитанном» (раунд 3, паттерн Telegram
 * «open at first unread + divider»): при открытии беседы с непрочитанными
 * лента встаёт на ПЕРВОМ сообщении с seq > myLastReadSeq (над ним —
 * разделитель, грамматика дата-чипов, рендерит лента). Прокрутка —
 * scrollToMessage(align:start) при первых данных: useLayoutEffect срабатывает
 * ДО MutationObserver-колбэка примитива (layout-фазы синхронны после коммита,
 * MO — микротаск после), поэтому якорь побеждает дефолтный «в конец».
 *
 * autoScroll включается только после якоря: пока пользователь не долистал
 * сам до низа, новые сообщения ленту не дёргают (модальный autoScroll
 * примитива: following-bottom включается фактом нахождения у низа).
 * Первое непрочитанное вне загруженного окна (>50 непрочитанных) — остаёмся
 * на дне (дозагрузка истории назад — задел пагинации).
 */
export function UnreadAnchor({
  items,
  isLoading,
  anchorSeq,
  onAnchored,
}: {
  items: readonly ChatMessage[];
  isLoading: boolean;
  /** Порог непрочитанности (myLastReadSeq); null — непрочитанных нет. */
  anchorSeq: number | null;
  onAnchored: () => void;
}): null {
  const { scrollToMessage } = useMessageScroller();
  const done = useRef(false);

  useEffect(() => {
    if (done.current || isLoading) return;
    done.current = true;
    // Непрочитанные исчезли/неизвестны или лента пуста (прочитано с другого
    // устройства, вычищенные данные) — якоря нет, снимаем блокировку
    // autoScroll немедленно.
    if (anchorSeq === null || items.length === 0) {
      onAnchored();
      return;
    }
    const firstUnread = items.find((m) => m.seq > anchorSeq && !m.deletedAt);
    if (firstUnread) {
      scrollToMessage(firstUnread.id, { align: 'start', behavior: 'auto' });
    }
    // Нет цели в окне — дефолт (низ) уже применён примитивом; якорь завершён.
    onAnchored();
  }, [items, isLoading, anchorSeq, scrollToMessage, onAnchored]);

  return null;
}
