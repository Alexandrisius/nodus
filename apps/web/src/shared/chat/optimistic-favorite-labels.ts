import { create } from 'zustand';

/**
 * Оптимистичные личные тэги ДО существования закладки (#215, ревизия
 * приёмки): тэг на записи витрины — карточки в кэше списка ещё нет, а
 * ВСТАВКА прогноза-карточки в кэш прямо во время взаимодействия дёргала
 * ленту (первое выставление после загрузки страницы). Мгновенность чипов
 * теперь живёт ЗДЕСЬ — локально, без мутации кэша списка; onSuccess
 * (сервер создал закладку + рефеч списка) и onError снимают метку.
 */
interface OptimisticFavoriteLabelsState {
  labels: Map<string, string[]>;
  set: (messageId: string, labels: string[]) => void;
  clear: (messageId: string) => void;
}

export const useOptimisticFavoriteLabels = create<OptimisticFavoriteLabelsState>((set) => ({
  labels: new Map(),
  set: (messageId, labels) =>
    set((state) => {
      const next = new Map(state.labels);
      next.set(messageId, labels);
      return { labels: next };
    }),
  clear: (messageId) =>
    set((state) => {
      if (!state.labels.has(messageId)) return state;
      const next = new Map(state.labels);
      next.delete(messageId);
      return { labels: next };
    }),
}));
