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

/**
 * Окно отправки вложений (#144, референсы Telegram/Bitrix): scope черновика,
 * чьи вложения показывает окно. Инвариант: draft.attachments непуст ⟺ окно
 * открыто (открытие — в addFiles, закрытие гасит вложения отменой или
 * очисткой черновика отправкой).
 */
interface AttachSendDialogState {
  scope: string | null;
  /** Подпись окна — ОТДЕЛЬНОЕ поле от черновика композера (канон Telegram,
   *  вердикт 29.09.2026): набор в окне НЕ дублируется онлайн в композер; при
   *  открытии текст композера переезжает сюда, при отмене — возвращается. */
  caption: string;
  open: (scope: string, initialCaption?: string) => void;
  setCaption: (caption: string) => void;
  close: () => void;
}

export const useAttachSendDialog = create<AttachSendDialogState>((set) => ({
  scope: null,
  caption: '',
  open: (scope, initialCaption = '') => set({ scope, caption: initialCaption }),
  setCaption: (caption) => set({ caption }),
  close: () => set({ scope: null, caption: '' }),
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
