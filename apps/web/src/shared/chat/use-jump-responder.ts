import { ui } from '@nodus/contracts';
import { useEffect, type RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { JUMP_TTL_MS, useFlashStore, useJumpStore } from './jump-store.js';
import { ensureOlderPage, hasOlderMessages } from './messages-history.js';
import { revealMessage } from './scroll-jump.js';

/**
 * Исполнитель прыжка к сообщению (A2/A3/A7, #87; скролл-политика — вердикт
 * 25.09): монтируется лентой-владельцем, получает запрос из jump-store.
 * Сначала решение «видно/не видно» (scroll-jump.ts): цель полностью в области
 * прокрутки — ТОЛЬКО вспышка, ноль скролла; не видна — плавный скролл внутрь
 * контейнера ленты (центр, кламп низа — лента не отрывается от низа, дыр нет;
 * scrollIntoView/спейсер примитива не используются — они и рвали низ).
 * Семантика TUIChat: цель в DOM — reveal+вспышка; лента ещё грузится — ждём
 * (запрос не теряется при навигации из другой беседы).
 *
 * #307: цель старее загруженного окна — НЕ тост, а бэкфилл: страница за
 * страницей догружаем историю (ensureOlderPage), эффект перезапускается на
 * выросшем кэше; лимит попыток режет глубокий промах, исчерпание — тост.
 */
const BACKFILL_PAGE_LIMIT = 30;

/** Счётчик бэкфилл-попыток прыжка (по nonce — переживает ререндеры резидента). */
const backfillAttempts = new Map<number, number>();

export function useJumpResponder(match: {
  conversationId: string;
  threadRootId: string | null;
  itemCount: number;
  /** Прокручиваемый контейнер ленты: viewport MessageScroller либо div ленты
   *  канала (thread-feed). Якоря data-message-id ставит MessageRow. */
  containerRef: RefObject<HTMLElement | null>;
}): void {
  const queryClient = useQueryClient();
  const target = useJumpStore((s) => s.target);
  const { conversationId, threadRootId, itemCount, containerRef } = match;

  useEffect(() => {
    if (!target) return;
    if (target.conversationId !== conversationId) return;
    if ((target.threadRootId ?? null) !== threadRootId) return;
    const consume = () => {
      backfillAttempts.delete(target.nonce);
      useJumpStore.getState().consume(target.nonce);
    };
    if (Date.now() - target.requestedAt > JUMP_TTL_MS) {
      consume();
      return;
    }
    if (itemCount === 0) return; // лента грузится — effect перезапустится на данных
    const container = containerRef.current;
    const el = container?.querySelector(`[data-message-id="${CSS.escape(target.messageId)}"]`);
    if (container && el instanceof HTMLElement) {
      consume();
      revealMessage(el, container);
      useFlashStore.getState().flash(target.messageId);
      return;
    }
    // Цель вне окна — бэкфилл истории (#307): по странице за перезапуск
    // эффекта; страница не дала роста (граница кончилась) — тост сразу.
    if (hasOlderMessages(queryClient, conversationId, threadRootId)) {
      const attempts = (backfillAttempts.get(target.nonce) ?? 0) + 1;
      backfillAttempts.set(target.nonce, attempts);
      if (attempts <= BACKFILL_PAGE_LIMIT) {
        void ensureOlderPage(queryClient, conversationId, threadRootId).then((loaded) => {
          if (!loaded) {
            consume();
            toast(ui.chat.jumpNotFound);
          }
        });
        return; // без consume: эффект перезапустится на выросшем кэше
      }
    }
    consume();
    toast(ui.chat.jumpNotFound);
  }, [target, conversationId, threadRootId, itemCount, containerRef, queryClient]);
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
