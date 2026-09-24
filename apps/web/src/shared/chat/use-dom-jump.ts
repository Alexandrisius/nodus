import { ui } from '@nodus/contracts';
import { useEffect, type RefObject } from 'react';
import { toast } from 'sonner';

import { JUMP_TTL_MS, useFlashStore, useJumpStore } from './jump-store.js';

/**
 * DOM-прыжок к сообщению для лент БЕЗ MessageScroller (лента канала
 * thread-feed — обычный overflow-контейнер): якоря data-message-id ставит
 * MessageRow. Семантика та же, что у use-jump-responder: цель найдена —
 * scrollIntoView (центр) + вспышка; лента пуста — ждём данные; цели нет —
 * явный тост; протухший запрос — тихо выбрасываем.
 */
export function useDomJumpResponder(
  containerRef: RefObject<HTMLElement | null>,
  match: { conversationId: string; threadRootId: string | null; itemCount: number },
): void {
  const target = useJumpStore((s) => s.target);
  const { conversationId, threadRootId, itemCount } = match;

  useEffect(() => {
    if (!target) return;
    if (target.conversationId !== conversationId) return;
    if ((target.threadRootId ?? null) !== threadRootId) return;
    const consume = () => useJumpStore.getState().consume(target.nonce);
    if (Date.now() - target.requestedAt > JUMP_TTL_MS) {
      consume();
      return;
    }
    if (itemCount === 0) return;
    const el = containerRef.current?.querySelector(
      `[data-message-id="${CSS.escape(target.messageId)}"]`,
    );
    consume();
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      useFlashStore.getState().flash(target.messageId);
    } else {
      toast(ui.chat.jumpNotFound);
    }
  }, [target, conversationId, threadRootId, itemCount, containerRef]);
}
