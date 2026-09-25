import { create } from 'zustand';

/**
 * «Печатает…» (эфемерно, #104): gateway рассылает `chat.typing` в комнату
 * беседы не чаще ~3 с на пользователя; запись живёт до expiry (4 с > троттла)
 * и гаснет таймером. Свои события не показываем (фильтрует потребитель).
 */
export interface TypingEntry {
  userId: string;
  expiresAt: number;
}

interface TypingState {
  entries: Record<string, TypingEntry | undefined>;
  touch: (conversationId: string, userId: string) => void;
  dropExpired: (conversationId: string, expiresAt: number) => void;
  reset: () => void;
}

const TYPING_TTL_MS = 4_000;

export const useTypingStore = create<TypingState>((set) => ({
  entries: {},
  touch(conversationId, userId) {
    const expiresAt = Date.now() + TYPING_TTL_MS;
    set((state) => ({ entries: { ...state.entries, [conversationId]: { userId, expiresAt } } }));
    setTimeout(() => {
      useTypingStore.getState().dropExpired(conversationId, expiresAt);
    }, TYPING_TTL_MS + 50);
  },
  dropExpired(conversationId, expiresAt) {
    // Гасим только свою запись: новый touch мог перезаписать её до таймера.
    set((state) => {
      const current = state.entries[conversationId];
      if (!current || current.expiresAt !== expiresAt) {
        return state;
      }
      const entries = { ...state.entries };
      delete entries[conversationId];
      return { entries };
    });
  },
  reset() {
    set({ entries: {} });
  },
}));
