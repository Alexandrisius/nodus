import { create } from 'zustand';

/**
 * Карточка просмотра уведомления (#100): открытое уведомление — одна точка
 * состояния. Карточка живёт В КОЛОНКЕ ленты на Главной (поверх неё, фидбек
 * владельца 01.10) — открытие из другого раздела (колокольчик, тост) сначала
 * приводит на Главную (openNotificationReader, model/open-notification.ts).
 */
interface NotificationDetailState {
  notificationId: string | null;
  open: (id: string) => void;
  close: () => void;
}

export const useNotificationDetailStore = create<NotificationDetailState>((set) => ({
  notificationId: null,
  open: (id) => set({ notificationId: id }),
  close: () => set({ notificationId: null }),
}));
