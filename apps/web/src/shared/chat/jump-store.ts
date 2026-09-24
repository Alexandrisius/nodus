import { create } from 'zustand';

/**
 * Прыжок к сообщению + вспышка (A2/A3/A7, #87): единый механизм для клика
 * по цитате, пин-бару и «Переслано от». Запрос живёт в сторе — источник
 * (цитата в пузыре, пин-бар, панель, другая беседа) и исполнитель (лента
 * целевой беседы через use-jump-responder) развязаны; кросс-беседный прыжок
 * переживает навигацию (target хранится до consume; ttl — защита от протухших).
 */

export interface JumpTarget {
  conversationId: string;
  /** null — основная лента; uuid — окно треда канала. */
  threadRootId: string | null;
  messageId: string;
  nonce: number;
  requestedAt: number;
}

/** Протухший запрос (беседа так и не открылась) — игнорируется. */
export const JUMP_TTL_MS = 10_000;

let nonceSeq = 0;

interface JumpState {
  target: JumpTarget | null;
  request: (conversationId: string, messageId: string, threadRootId?: string | null) => void;
  consume: (nonce: number) => void;
}

export const useJumpStore = create<JumpState>((set) => ({
  target: null,
  request: (conversationId, messageId, threadRootId = null) =>
    set({
      target: {
        conversationId,
        messageId,
        threadRootId,
        nonce: ++nonceSeq,
        requestedAt: Date.now(),
      },
    }),
  consume: (nonce) => set((s) => (s.target?.nonce === nonce ? { target: null } : s)),
}));

/** Длительность вспышки — канон research: мгновенная подсветка + затухание ~2 с
 *  (css-tricks yellow flash, Discord blurple); CSS — .animate-message-flash. */
export const FLASH_MS = 2000;

let flashTimer: number | undefined;

interface FlashState {
  messageId: string | null;
  flash: (messageId: string) => void;
}

export const useFlashStore = create<FlashState>((set) => ({
  messageId: null,
  flash: (messageId) => {
    window.clearTimeout(flashTimer);
    set({ messageId });
    flashTimer = window.setTimeout(() => set({ messageId: null }), FLASH_MS);
  },
}));
