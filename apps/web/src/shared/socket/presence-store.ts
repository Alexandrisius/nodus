import { create } from 'zustand';

/**
 * Presence (#104, эфемерно): онлайн = есть живые WS-соединения (gateway).
 * Снимок приходит подключению, обновления — всем. В БД не хранится (канон);
 * offline-состояние — отсутствие записи в карте.
 */
interface PresenceState {
  online: Record<string, true | undefined>;
  applySnapshot: (users: { id: string }[]) => void;
  setStatus: (userId: string, status: 'online' | 'away' | 'offline') => void;
  reset: () => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  online: {},
  applySnapshot(users) {
    const online: Record<string, true> = {};
    for (const user of users) {
      online[user.id] = true;
    }
    set({ online });
  },
  setStatus(userId, status) {
    set((state) => {
      const online = { ...state.online };
      if (status === 'online' || status === 'away') {
        online[userId] = true;
      } else {
        delete online[userId];
      }
      return { online };
    });
  },
  reset() {
    set({ online: {} });
  },
}));

export function useIsOnline(userId: string | null | undefined): boolean {
  return usePresenceStore((state) => (userId ? state.online[userId] === true : false));
}
