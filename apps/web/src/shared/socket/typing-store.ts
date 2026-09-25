import { create } from 'zustand';

/**
 * «Печатает…» (эфемерно, #104): gateway рассылает `chat.typing` не чаще ~3 с
 * на пользователя; запись живёт до expiry (4 с > троттла) и гаснет таймером.
 * Свои события не показываем (фильтрует потребитель).
 *
 * Раунд 3: печать В ТРЕДЕ живёт под составным ключом `convId:rootId` —
 * индикатор снимается шапкой окна треда; список бесед и шапки бесед читают
 * только ключ беседы (thread-печать туда не попадает).
 */
export interface TypingEntry {
  userId: string;
  expiresAt: number;
}

interface TypingState {
  entries: Record<string, TypingEntry | undefined>;
  touch: (conversationId: string, userId: string, threadRootId?: string | null) => void;
  dropExpired: (key: string, expiresAt: number) => void;
  reset: () => void;
}

const TYPING_TTL_MS = 4_000;

export function typingKey(conversationId: string, threadRootId?: string | null): string {
  return threadRootId ? `${conversationId}:${threadRootId}` : conversationId;
}

export const useTypingStore = create<TypingState>((set) => ({
  entries: {},
  touch(conversationId, userId, threadRootId = null) {
    const key = typingKey(conversationId, threadRootId);
    const expiresAt = Date.now() + TYPING_TTL_MS;
    set((state) => ({ entries: { ...state.entries, [key]: { userId, expiresAt } } }));
    setTimeout(() => {
      useTypingStore.getState().dropExpired(key, expiresAt);
    }, TYPING_TTL_MS + 50);
  },
  dropExpired(key, expiresAt) {
    // Гасим только свою запись: новый touch мог перезаписать её до таймера.
    set((state) => {
      const current = state.entries[key];
      if (!current || current.expiresAt !== expiresAt) {
        return state;
      }
      const entries = { ...state.entries };
      delete entries[key];
      return { entries };
    });
  },
  reset() {
    set({ entries: {} });
  },
}));
