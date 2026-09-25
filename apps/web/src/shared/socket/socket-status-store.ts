import { create } from 'zustand';

/**
 * Тихий статус WS-соединения чата (#104): UI его не показывает, но слушатели
 * refetchInterval переключают интервалы (сокет жив → редкий опрос-fallback).
 */
interface SocketStatusState {
  connected: boolean;
  setConnected: (connected: boolean) => void;
}

export const useSocketStatusStore = create<SocketStatusState>((set) => ({
  connected: false,
  setConnected: (connected) => {
    set({ connected });
  },
}));
