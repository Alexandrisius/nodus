import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ViewFieldPrefs, ViewSort } from '@nodus/contracts';

import { viewsEnvelopeSchema, zodPersistMerge } from '../lib/persist-zod.js';

/**
 * Персональные настройки представлений всех модулей (схема — contracts
 * viewPresetSchema; на проде — API персонализации, §10.5). Ключ вида:
 * '<module>.<view>' ('tasks.list', 'tasks.kanban', 'letters.list'…).
 * sorts — активная сортировка списка (концепт #4: одна колонка, ↑/↓).
 */
interface ViewState {
  views: Record<string, Record<string, ViewFieldPrefs>>;
  sorts: Record<string, ViewSort>;
  setFieldVisible: (view: string, field: string, visible: boolean) => void;
  setFieldWidth: (view: string, field: string, width: number) => void;
  /** Порядок колонок (drag за заголовок): entries — ПОЛНЫЙ список полей вида
   *  (видимые в новом порядке + скрытые следом) с их ТЕКУЩЕЙ видимостью.
   *  Видимость НЕ насилуется: сохранённая побеждает, без сохранённой —
   *  текущая из реестра (урок 15.09.2026: дефолт visible:true воскрешал
   *  все скрытые по умолчанию поля на первом drag колонки). */
  applyOrder: (view: string, entries: { id: string; visible: boolean }[]) => void;
  setSort: (view: string, sort: ViewSort) => void;
  resetView: (view: string) => void;
}

export const useViewStore = create<ViewState>()(
  persist(
    (set) => ({
      views: {},
      sorts: {},
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
      applyOrder: (view, entries) =>
        set((s) => ({
          views: {
            ...s.views,
            [view]: {
              ...s.views[view],
              ...Object.fromEntries(
                entries.map((e, i) => [
                  e.id,
                  {
                    visible: e.visible,
                    ...s.views[view]?.[e.id],
                    order: i,
                  } satisfies ViewFieldPrefs,
                ]),
              ),
            },
          },
        })),
      setSort: (view, sort) => set((s) => ({ sorts: { ...s.sorts, [view]: sort } })),
      resetView: (view) =>
        set((s) => {
          const next = { ...s.views };
          delete next[view];
          const nextSorts = { ...s.sorts };
          delete nextSorts[view];
          return { views: next, sorts: nextSorts };
        }),
    }),
    {
      name: 'nodus-views-v1',
      version: 1,
      partialize: (state) => ({ views: state.views, sorts: state.sorts }),
      merge: zodPersistMerge<ViewState>(viewsEnvelopeSchema),
    },
  ),
);
