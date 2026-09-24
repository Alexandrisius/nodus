import { ui } from '@nodus/contracts';
import { useMessageScroller } from '@nodus/ui/components/message-scroller';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { JUMP_TTL_MS, useFlashStore, useJumpStore } from './jump-store.js';

/**
 * Исполнитель прыжка к сообщению (A2/A3/A7, #87): монтируется ВНУТРИ
 * MessageScrollerProvider ленты; получает запрос из jump-store, скроллит
 * к цели (align center — канон Telegram itemTopForHighlight: цель
 * центрируется) и запускает вспышку. Семантика TUIChat: цель в DOM —
 * скролл+вспышка; лента ещё грузится — ждём (запрос не теряется при
 * навигации из другой беседы); цели нет среди загруженных — явный тост,
 * не молчание (research: «не можем найти» — не вариант). Протухший запрос
 * (ttl) выбрасывается тихо.
 */
export function useJumpResponder(match: {
  conversationId: string;
  threadRootId: string | null;
  itemCount: number;
}): void {
  const { scrollToMessage } = useMessageScroller();
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
    if (itemCount === 0) return; // лента грузится — effect перезапустится на данных
    const found = scrollToMessage(target.messageId, { align: 'center', behavior: 'smooth' });
    consume();
    if (found) useFlashStore.getState().flash(target.messageId);
    else toast(ui.chat.jumpNotFound);
  }, [target, conversationId, threadRootId, itemCount, scrollToMessage]);
}

/** Null-компонент для монтажа хука внутри MessageScrollerProvider лент. */
export function JumpResponder(props: {
  conversationId: string;
  threadRootId: string | null;
  itemCount: number;
}): null {
  useJumpResponder(props);
  return null;
}
