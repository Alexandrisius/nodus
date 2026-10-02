import { create } from 'zustand';

import type { AttachmentPreviewKind } from '@nodus/contracts';

/**
 * Стор просмотрщика вложений (#138): один вьюер на приложение (хост — в
 * app-shell рядом с ChatDialogHosts). Инициатор (чип вложения в любом
 * хосте: пузырь чата, панель беседы, дровер задачи) кладёт цель в стор —
 * без прокидывания состояния через props. Паттерн — dialog-stores чата.
 */
export interface ViewerTarget {
  fileId: string;
  name: string;
  mime: string;
  size: number;
  /** Подписанная ссылка контента (относительная, same-origin). */
  url: string | null;
  /** Маршрут просмотрщика с сервера (#139); undefined — старый DTO без
   * классификации (реестр вычислит локально). */
  previewKind?: AttachmentPreviewKind;
  /** PDF-копия офисного документа (#139): fallback при выключенном движке;
   * 404 по ссылке = копия ещё не готова. */
  pdfUrl?: string | null;
}

interface ViewerState {
  target: ViewerTarget | null;
  open: (target: ViewerTarget) => void;
  close: () => void;
}

export const useViewerStore = create<ViewerState>((set) => ({
  target: null,
  open: (target) => set({ target }),
  close: () => set({ target: null }),
}));
