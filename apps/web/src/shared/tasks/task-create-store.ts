import { create } from 'zustand';

import type { TaskCreatePrefill } from './task-create-draft.js';

/**
 * Состояние единого окна создания (#432, Р9): один хост в оболочке и
 * zustand-стор. Любой вход (кнопка «Создать», плюсик колонки, подзадача,
 * «В задачу») открывает ОДНО окно с заполнением — вторых форм в приложении
 * нет. Стор в памяти: окно живёт в пределах страницы.
 */
interface TaskCreateState {
  prefill: TaskCreatePrefill | null;
  open: (prefill?: TaskCreatePrefill) => void;
  close: () => void;
}

export const useTaskCreateStore = create<TaskCreateState>()((set) => ({
  prefill: null,
  open: (prefill = {}) => set({ prefill }),
  close: () => set({ prefill: null }),
}));

/** Открыть окно создания из любого места (без хука). */
export function openTaskCreate(prefill: TaskCreatePrefill = {}): void {
  useTaskCreateStore.getState().open(prefill);
}

export function closeTaskCreate(): void {
  useTaskCreateStore.getState().close();
}
