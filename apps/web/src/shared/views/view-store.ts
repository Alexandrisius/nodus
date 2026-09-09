import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ViewFieldPrefs } from '@nodus/contracts';

/**
 * Персональные настройки представлений всех модулей (схема — contracts
 * viewPresetSchema; на проде — API персонализации, §10.5). Ключ вида:
 * '<module>.<view>' ('tasks.list', 'tasks.kanban', 'letters.list'…).
 */
interface ViewState {
  views: Record<string, Record<string, ViewFieldPrefs>>;
  setFieldVisible: (view: string, field: string, visible: boolean) => void;
  setFieldWidth: (view: string, field: string, width: number) => void;
  resetView: (view: string) => void;
}

export const useViewStore = create<ViewState>()(
  persist(
    (set) => ({
      views: {},
      setFieldVisible: (view, field, visible) =>
        set((s) => ({
          views: {
            ...s.views,
            [view]: { ...s.views[view], [field]: { ...s.views[view]?.[field], visible } },
          },
        })),
      setFieldWidth: (view, field, width) =>
        set((s) => ({
          views: {
            ...s.views,
            [view]: {
              ...s.views[view],
              [field]: { visible: true, ...s.views[view]?.[field], width },
            },
          },
        })),
      resetView: (view) =>
        set((s) => {
          const next = { ...s.views };
          delete next[view];
          return { views: next };
        }),
    }),
    { name: 'nodus-views-v1', partialize: (state) => ({ views: state.views }) },
  ),
);
