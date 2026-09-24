import { ui } from '@nodus/contracts';
import { useEffect, type RefObject } from 'react';
import { toast } from 'sonner';

import { JUMP_TTL_MS, useFlashStore, useJumpStore } from './jump-store.js';
import { revealMessage } from './scroll-jump.js';

/**
 * Исполнитель прыжка к сообщению (A2/A3/A7, #87; скролл-политика — вердикт
 * 25.09): монтируется лентой-владельцем, получает запрос из jump-store.
 * Сначала решение «видно/не видно» (scroll-jump.ts): цель полностью в области
 * прокрутки — ТОЛЬКО вспышка, ноль скролла; не видна — плавный скролл внутрь
 * контейнера ленты (центр, кламп низа — лента не отрывается от низа, дыр нет;
 * scrollIntoView/спейсер примитива не используются — они и рвали низ).
 * Семантика TUIChat: цель в DOM — reveal+вспышка; лента ещё грузится — ждём
 * (запрос не теряется при навигации из другой беседы); цели нет среди
 * загруженных — явный тост, не молчание. Протухший запрос (ttl) — тихо.
 */
export function useJumpResponder(match: {
  conversationId: string;
  threadRootId: string | null;
  itemCount: number;
  /** Прокручиваемый контейнер ленты: viewport MessageScroller либо div ленты
   *  канала (thread-feed). Якоря data-message-id ставит MessageRow. */
  containerRef: RefObject<HTMLElement | null>;
}): void {
  const target = useJumpStore((s) => s.target);
  const { conversationId, threadRootId, itemCount, containerRef } = match;

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
    const container = containerRef.current;
    const el = container?.querySelector(`[data-message-id="${CSS.escape(target.messageId)}"]`);
    consume();
    if (!(container && el instanceof HTMLElement)) {
      toast(ui.chat.jumpNotFound);
      return;
    }
    revealMessage(el, container);
    useFlashStore.getState().flash(target.messageId);
  }, [target, conversationId, threadRootId, itemCount, containerRef]);
}

/** Null-компонент для монтажа хука внутри MessageScrollerProvider лент. */
export function JumpResponder(props: {
  conversationId: string;
  threadRootId: string | null;
  itemCount: number;
  containerRef: RefObject<HTMLElement | null>;
}): null {
  useJumpResponder(props);
  return null;
}
