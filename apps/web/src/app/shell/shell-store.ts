import { create } from 'zustand';

import type { DockPoint } from './slider-panel.js';

export type ThemeId = 'nodus' | 'ink' | 'paper';

interface ShellState {
  menuCollapsed: boolean;
  theme: ThemeId;
  commandOpen: boolean;
  /** Точка вьюпорта, от которой открылся слайдер (док-ребро); null — без ребра. */
  lastDock: DockPoint | null;
  toggleMenu: () => void;
  setTheme: (theme: ThemeId) => void;
  setCommandOpen: (open: boolean) => void;
  setLastDock: (dock: DockPoint | null) => void;
}

/** Локальное UI-состояние каркаса (персонализация на сервере — позже, §10.5). */
export const useShellStore = create<ShellState>((set) => ({
  menuCollapsed: false,
  theme: 'nodus',
  commandOpen: false,
  lastDock: null,
  toggleMenu: () => set((s) => ({ menuCollapsed: !s.menuCollapsed })),
  setTheme: (theme) => set({ theme }),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  setLastDock: (lastDock) => set({ lastDock }),
}));
