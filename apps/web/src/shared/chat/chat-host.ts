import { createContext, useContext } from 'react';

/**
 * Хозяин чата (кто рендерит ленту) — порт внутренней навигации (вердикт
 * владельца 25.09, п.4): в мессенджере ЛЮБАЯ навигация по сообщениям
 * (пересланное, цитата, закреп) происходит ВНУТРИ мессенджера — переключиться
 * на беседу-источник/тред, проскроллить, подсветить; слайдер для этого НЕ
 * открывается. Мессенджер-хосты (страница /chat и полноэкранная карточка
 * `messenger:<id>`) провайдят контекст; чаты ВНУТРИ карточек сущностей
 * (задача/проект/письмо/сотрудник) контекста не имеют — переход к чужой
 * беседе там открывает карточку мессенджера поверх сущности (легитимная роль
 * слайдера), см. jumpToForwardSource.
 */
export interface ChatHostNavigation {
  /** Открыть беседу внутри текущего хозяина: страница — маршрут (с тредом
   *  в ?thread=), карточка — замена содержимого слайдера без ремаунта. */
  openConversation: (conversationId: string, threadRootId: string | null) => void;
}

export const ChatHostNavigationContext = createContext<ChatHostNavigation | null>(null);

export function useChatHostNavigation(): ChatHostNavigation | null {
  return useContext(ChatHostNavigationContext);
}
