import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { shellEnvelopeSchema, zodPersistMerge } from '../../shared/lib/persist-zod.js';
import type { SourceRect } from './slider-panel.js';

/** Продуктовые темы «Инструмента»: светлая (ДЕФОЛТ — вердикт владельца
 * 15.09.2026, живёт в :root без атрибута) и тёмная (data-theme='dark'). */
export type ThemeId = 'dark' | 'light';

interface ShellState {
  menuCollapsed: boolean;
  theme: ThemeId;
  commandOpen: boolean;
  /** Служебная полоса справа раскрыта (кнопка-шевроны внизу полосы, вердикт
   *  владельца 14.09.2026: без авто-раскрытия по наведению). Живёт в сторе,
   *  а не в полосе:
   *  ширина полосы меняет геометрию карточек-слайдеров (правый край карточки
   *  = правый край мягкой рамы, план R4) — состояние нужно двум компонентам. */
  edgeOpen: boolean;
  /** Rect источника, от которого раскрылся слайдер (shared-element); null — scale-fade. */
  lastSource: SourceRect | null;
  toggleMenu: () => void;
  toggleTheme: () => void;
  setCommandOpen: (open: boolean) => void;
  setEdgeOpen: (open: boolean) => void;
  setLastSource: (source: SourceRect | null) => void;
}

/** Локальное UI-состояние каркаса (персонализация на сервере — позже, §10.5).
 * Тема персистит в localStorage (nodus-shell-v1), остальное — сессионное. */
export const useShellStore = create<ShellState>()(
  persist(
    (set) => ({
      menuCollapsed: false,
      theme: 'light',
      commandOpen: false,
      edgeOpen: false,
      lastSource: null,
      toggleMenu: () => set((s) => ({ menuCollapsed: !s.menuCollapsed })),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      setCommandOpen: (commandOpen) => set({ commandOpen }),
      setEdgeOpen: (edgeOpen) => set({ edgeOpen }),
      setLastSource: (lastSource) => set({ lastSource }),
    }),
    {
      name: 'nodus-shell-v1',
      version: 1,
      partialize: (state) => ({ theme: state.theme, edgeOpen: state.edgeOpen }),
      merge: zodPersistMerge<ShellState>(shellEnvelopeSchema),
    },
  ),
);
