import { create } from 'zustand';

/**
 * Запрос «прокрутить ленту к концу» (вердикт 24.09: своё сообщение видно
 * ВСЕГДА — прокрутка к нему даже из середины истории; модель Telegram).
 * Скроллер живёт ВНУТРИ MessageScrollerProvider, композер — снаружи: связь
 * стором-нонсом (паттерн jump-store), ресивер — scroll-end-responder.tsx.
 *
 * Раунд 3 («дёргание» при пачках): нонс несёт ПОВЕДЕНИЕ — одиночная своя
 * отправка докручивает плавно (smooth), быстрая серия — мгновенно (auto:
 * smooth на каждую пачку скроллов выглядит рывками).
 */
export interface ScrollEndRequest {
  nonce: number;
  behavior: ScrollBehavior;
}

interface ScrollEndState {
  requests: Record<string, ScrollEndRequest | undefined>;
  request: (scope: string, behavior?: ScrollBehavior) => void;
}

export const useScrollEndStore = create<ScrollEndState>((set) => ({
  requests: {},
  request: (scope, behavior = 'smooth') =>
    set((s) => {
      const prev = s.requests[scope];
      return {
        requests: {
          ...s.requests,
          [scope]: { nonce: (prev?.nonce ?? 0) + 1, behavior },
        },
      };
    }),
}));
