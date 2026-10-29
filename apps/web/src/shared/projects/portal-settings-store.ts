import { create } from 'zustand';

/** Единое окно «Настройки портала» (#52, Р7): вход — меню профиля и
 *  «Автоматизация → Типы проектов». Полное окно с модулями — #276; сейчас
 *  первый жилец — раздел «Проекты». */
interface PortalSettingsState {
  open: boolean;
  openSettings: () => void;
  close: () => void;
}

export const usePortalSettingsStore = create<PortalSettingsState>()((set) => ({
  open: false,
  openSettings: () => set({ open: true }),
  close: () => set({ open: false }),
}));

export function openPortalSettings(): void {
  usePortalSettingsStore.getState().openSettings();
}
