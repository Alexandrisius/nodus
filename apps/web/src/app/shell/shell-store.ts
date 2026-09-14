import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { SourceRect } from './slider-panel.js';

/** Продуктовые темы «Инструмента»: тёмная (дефолт) и светлая. */
export type ThemeId = 'dark' | 'light';

interface ShellState {
  menuCollapsed: boolean;
  theme: ThemeId;
  commandOpen: boolean;
  /** Служебная полоса справа раскрыта (dwell). Живёт в сторе, а не в полосе:
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
      theme: 'dark',
      commandOpen: false,
      edgeOpen: false,
      lastSource: null,
      toggleMenu: () => set((s) => ({ menuCollapsed: !s.menuCollapsed })),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      setCommandOpen: (commandOpen) => set({ commandOpen }),
      setEdgeOpen: (edgeOpen) => set({ edgeOpen }),
      setLastSource: (lastSource) => set({ lastSource }),
    }),
    { name: 'nodus-shell-v1', partialize: (state) => ({ theme: state.theme }) },
  ),
);
