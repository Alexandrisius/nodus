import { useEffect } from 'react';

import { useConversations } from './api.js';

/** Базовое имя вкладки (index.html). */
const BASE_TITLE = 'Nodus';

/**
 * Счётчик непрочитанных в заголовке вкладки (#124, аудит #123: фоновая
 * вкладка не подавала НИКАКОГО сигнала о новых сообщениях). Сумма
 * unreadCount — прецедент бейджа рейки (node-rail). Монтируется в каркасе
 * (app-shell): запрос списка бесед там уже живёт.
 */
export function useUnreadTitle(): void {
  const { data } = useConversations();

  useEffect(() => {
    const total = (data?.items ?? []).reduce((sum, c) => sum + c.unreadCount, 0);
    document.title = total > 0 ? `(${total}) ${BASE_TITLE}` : BASE_TITLE;
  }, [data]);

  useEffect(
    () => () => {
      document.title = BASE_TITLE;
    },
    [],
  );
}
