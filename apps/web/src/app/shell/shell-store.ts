import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { DockPoint } from './slider-panel.js';

/** Продуктовые темы «Инструмента»: тёмная (дефолт) и светлая. */
export type ThemeId = 'dark' | 'light';

interface ShellState {
  menuCollapsed: boolean;
  theme: ThemeId;
  commandOpen: boolean;
  /** Точка вьюпорта, от которой открылся слайдер (док-ребро); null — без ребра. */
  lastDock: DockPoint | null;
  toggleMenu: () => void;
  toggleTheme: () => void;
  setCommandOpen: (open: boolean) => void;
  setLastDock: (dock: DockPoint | null) => void;
}

/** Локальное UI-состояние каркаса (персонализация на сервере — позже, §10.5).
 * Тема персистит в localStorage (nodus-shell-v1), остальное — сессионное. */
export const useShellStore = create<ShellState>()(
  persist(
    (set) => ({
      menuCollapsed: false,
      theme: 'dark',
      commandOpen: false,
      lastDock: null,
      toggleMenu: () => set((s) => ({ menuCollapsed: !s.menuCollapsed })),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      setCommandOpen: (commandOpen) => set({ commandOpen }),
      setLastDock: (lastDock) => set({ lastDock }),
    }),
    { name: 'nodus-shell-v1', partialize: (state) => ({ theme: state.theme }) },
  ),
);
