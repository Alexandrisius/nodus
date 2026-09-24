import { create } from 'zustand';

/**
 * Запрос «прокрутить ленту к концу» (вердикт 24.09: своё сообщение видно
 * ВСЕГДА — прокрутка к нему даже из середины истории; модель Telegram).
 * Скроллер живёт ВНУТРИ MessageScrollerProvider, композер — снаружи: связь
 * стором-нонсом (паттерн jump-store), ресивер — scroll-end-responder.tsx.
 */
interface ScrollEndState {
  nonces: Record<string, number>;
  request: (scope: string) => void;
}

export const useScrollEndStore = create<ScrollEndState>((set) => ({
  nonces: {},
  request: (scope) =>
    set((s) => ({ nonces: { ...s.nonces, [scope]: (s.nonces[scope] ?? 0) + 1 } })),
}));
