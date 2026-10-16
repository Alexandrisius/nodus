import { create } from 'zustand';

/**
 * Глобальный запрос «открыть беседу в хосте мессенджера» (#306): источники
 * вне дерева ChatHostNavigationProvider (глобальный SelectionQuoteBubble в
 * app-shell) не видят контекст навигации — запрос кладётся в стор, резидент
 * внутри провайдера (messenger-body) исполняет его через openConversation.
 * Паттерн jump-store: nonce-запрос + consume (исполнение одно на запрос).
 */
export interface ConversationOpenRequest {
  conversationId: string;
  /** null — основная лента; uuid — окно треда канала. */
  threadRootId: string | null;
  nonce: number;
}

interface ConversationOpenState {
  request: ConversationOpenRequest | null;
  open: (conversationId: string, threadRootId: string | null) => void;
  consume: (nonce: number) => void;
}

let nonceSeq = 0;

export const useConversationOpenStore = create<ConversationOpenState>((set) => ({
  request: null,
  open: (conversationId, threadRootId) =>
    set({ request: { conversationId, threadRootId, nonce: ++nonceSeq } }),
  consume: (nonce) => set((s) => (s.request?.nonce === nonce ? { request: null } : s)),
}));
