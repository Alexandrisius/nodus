import { create } from 'zustand';

export type ThemeId = 'corporate' | 'airy';

interface ShellState {
  menuCollapsed: boolean;
  railCollapsed: boolean;
  theme: ThemeId;
  commandOpen: boolean;
  toggleMenu: () => void;
  toggleRail: () => void;
  setTheme: (theme: ThemeId) => void;
  setCommandOpen: (open: boolean) => void;
}

/** Локальное UI-состояние каркаса (персонализация на сервере — позже, §10.5). */
export const useShellStore = create<ShellState>((set) => ({
  menuCollapsed: false,
  railCollapsed: false,
  theme: 'corporate',
  commandOpen: false,
  toggleMenu: () => set((s) => ({ menuCollapsed: !s.menuCollapsed })),
  toggleRail: () => set((s) => ({ railCollapsed: !s.railCollapsed })),
  setTheme: (theme) => set({ theme }),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
}));
