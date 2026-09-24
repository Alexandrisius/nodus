import { create } from 'zustand';

/**
 * Сторы глобальных диалогов линии A (#87): пересылка и подтверждение
 * удаления. Диалог один на приложение (хосты — в app-shell), инициатор
 * (контекстное меню сообщения, полоса селекта) кладёт запрос в стор —
 * компоненты в глубине дерева не тянут dialog-состояние через props.
 */

export interface ForwardRequest {
  sourceConversationId: string;
  messageIds: string[];
}

interface ForwardDialogState {
  request: ForwardRequest | null;
  open: (sourceConversationId: string, messageIds: string[]) => void;
  close: () => void;
}

export const useForwardDialog = create<ForwardDialogState>((set) => ({
  request: null,
  open: (sourceConversationId, messageIds) =>
    set({ request: { sourceConversationId, messageIds } }),
  close: () => set({ request: null }),
}));

export interface UnpinRequest {
  conversationId: string;
  messageId: string;
}

interface UnpinDialogState {
  request: UnpinRequest | null;
  ask: (conversationId: string, messageId: string) => void;
  close: () => void;
}

/** Открепление — ТОЛЬКО через диалог подтверждения (вердикт 24.09). */
export const useUnpinDialog = create<UnpinDialogState>((set) => ({
  request: null,
  ask: (conversationId, messageId) => set({ request: { conversationId, messageId } }),
  close: () => set({ request: null }),
}));

export interface DeleteRequest {
  conversationId: string;
  messageIds: string[];
}

interface DeleteDialogState {
  request: DeleteRequest | null;
  ask: (conversationId: string, messageIds: string[]) => void;
  close: () => void;
}

export const useDeleteDialog = create<DeleteDialogState>((set) => ({
  request: null,
  ask: (conversationId, messageIds) => set({ request: { conversationId, messageIds } }),
  close: () => set({ request: null }),
}));
