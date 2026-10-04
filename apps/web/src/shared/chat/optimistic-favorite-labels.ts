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

/** Кэш списка ДОГНАЛ оптимистичную метку (пришла карточка с теми же
 *  метками) — снять локальную: серверная истина теперь в кэше. Вызывается
 *  витриной на каждую смену cardsById. Снимать раньше (в onSuccess) нельзя
 *  — между ответом и рефетчем чип падал в пустышку (мигание, #215 приёмка:
 *  «на секунду пропадает и появляется»). */
export function reconcileOptimisticLabels(
  cards: Iterable<{ messageId: string; labels: string[] }>,
): void {
  const { labels, clear } = useOptimisticFavoriteLabels.getState();
  if (labels.size === 0) return;
  for (const card of cards) {
    const optimistic = labels.get(card.messageId);
    if (!optimistic) continue;
    const caughtUp =
      card.labels.length === optimistic.length &&
      card.labels.every((label, index) => label === optimistic[index]);
    if (caughtUp) clear(card.messageId);
  }
}
