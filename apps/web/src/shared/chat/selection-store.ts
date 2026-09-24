import { ui } from '@nodus/contracts';
import { toast } from 'sonner';
import { create } from 'zustand';

import { rangeBetween, withSelection } from './selection-range.js';

/**
 * Режим мультивыбора сообщений (A6, #87). scope = draftKey ленты
 * (`conversation:<id>` / `feed:<id>` / `thread:<rootId>`) — селект живёт
 * в одной ленте; смена беседы/вкладки сбрасывает (Telegram-семантика).
 * Снятие последнего выделения выходит из режима (tdesktop: deselect-all =
 * cancelSelection). Кнопки групповых действий показывает узкий островок
 * композера (chat-composer, вердикт 24.09 — верх ленты не двигается).
 */

interface SelectionState {
  scope: string | null;
  /** Порядок добавления (для «копировать как текст» — в порядке ленты сортирует вызывающий). */
  ids: string[];
  anchorId: string | null;
  enter: (scope: string, id: string) => void;
  toggle: (scope: string, id: string, shift?: boolean, orderedIds?: readonly string[]) => void;
  /** Тихое исключение (сообщение удалено другим участником во время селекта). */
  remove: (id: string) => void;
  exit: () => void;
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  scope: null,
  ids: [],
  anchorId: null,

  enter: (scope, id) => set({ scope, ids: [id], anchorId: id }),

  toggle: (scope, id, shift = false, orderedIds) => {
    const state = get();
    if (state.scope !== scope) {
      set({ scope, ids: [id], anchorId: id });
      return;
    }
    if (shift && state.anchorId && orderedIds) {
      const { ids, capped } = withSelection(
        state.ids,
        rangeBetween(orderedIds, state.anchorId, id),
      );
      if (capped) toast(ui.chat.selectionLimit);
      // Якорь не переезжает (канон Gmail: следующий Shift+клик от того же якоря).
      set({ ids });
      return;
    }
    if (state.ids.includes(id)) {
      const ids = state.ids.filter((x) => x !== id);
      set(ids.length === 0 ? { scope: null, ids: [], anchorId: null } : { ids });
      return;
    }
    const { ids, capped } = withSelection(state.ids, [id]);
    if (capped) {
      toast(ui.chat.selectionLimit);
      return;
    }
    set({ ids, anchorId: id });
  },

  remove: (id) =>
    set((s) => {
      if (!s.ids.includes(id)) return s;
      const ids = s.ids.filter((x) => x !== id);
      return ids.length === 0
        ? { scope: null, ids: [], anchorId: null }
        : { ids, anchorId: s.anchorId === id ? (ids[0] ?? null) : s.anchorId };
    }),

  exit: () => set({ scope: null, ids: [], anchorId: null }),
}));

const NO_IDS: string[] = [];

/** Выделение активно в данной ленте. */
export function useSelectionActive(scope: string): boolean {
  return useSelectionStore((s) => s.scope === scope && s.ids.length > 0);
}

/** Стабильный пустой массив — селектор не плодит ссылки. */
export function useSelectedIds(scope: string): string[] {
  return useSelectionStore((s) => (s.scope === scope ? s.ids : NO_IDS));
}
