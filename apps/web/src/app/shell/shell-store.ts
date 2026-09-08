import { create } from 'zustand';

export type ThemeId = 'nodus' | 'ink' | 'paper';

interface ShellState {
  menuCollapsed: boolean;
  theme: ThemeId;
  commandOpen: boolean;
  toggleMenu: () => void;
  setTheme: (theme: ThemeId) => void;
  setCommandOpen: (open: boolean) => void;
}

/** Локальное UI-состояние каркаса (персонализация на сервере — позже, §10.5). */
export const useShellStore = create<ShellState>((set) => ({
  menuCollapsed: false,
  theme: 'nodus',
  commandOpen: false,
  toggleMenu: () => set((s) => ({ menuCollapsed: !s.menuCollapsed })),
  setTheme: (theme) => set({ theme }),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
}));
