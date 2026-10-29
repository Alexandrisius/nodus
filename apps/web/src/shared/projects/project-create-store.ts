import { create } from 'zustand';

/** Заполнение окна создания проекта (мастер #468 расширит набор). */
export interface ProjectCreatePrefill {
  typeId?: string;
  portfolioId?: string;
  clientId?: string;
}

/**
 * Единое окно создания проекта (#52): один хост в оболочке и zustand-стор.
 * Любой вход (кнопка журнала, пикер проекта в форме задачи/письма) открывает
 * ОДНО окно — вторых форм в приложении нет. Стор в памяти страницы.
 */
interface ProjectCreateState {
  prefill: ProjectCreatePrefill | null;
  open: (prefill?: ProjectCreatePrefill) => void;
  close: () => void;
}

export const useProjectCreateStore = create<ProjectCreateState>()((set) => ({
  prefill: null,
  open: (prefill = {}) => set({ prefill }),
  close: () => set({ prefill: null }),
}));

export function openProjectCreate(prefill: ProjectCreatePrefill = {}): void {
  useProjectCreateStore.getState().open(prefill);
}

export function closeProjectCreate(): void {
  useProjectCreateStore.getState().close();
}
