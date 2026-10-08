import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { NotificationSummary } from '@nodus/contracts';

import { desktopSetUnreadBadge } from '../desktop/desktop-bridge.js';
import { notificationsKeys } from '../notifications-keys.js';
import { useConversations } from './api.js';

/** Базовое имя вкладки (index.html). */
const BASE_TITLE = 'Nodus';

/**
 * Заголовок вкладки (#124 → #100): приоритет индикации — ВАЖНОЕ из журнала
 * уведомлений (E8: срочно+личное+действия), затем непрочитанные чата (сумма
 * unreadCount — прецедент бейджа рейки). Сводка читается из кэша запроса
 * (ключ shared notificationsKeys) — свежесть несёт WS-инвалидация сводки.
 */
export function useUnreadTitle(): void {
  const { data } = useConversations();
  const queryClient = useQueryClient();

  useEffect(() => {
    const attention =
      queryClient.getQueryData<NotificationSummary>(notificationsKeys.summary())?.attention ?? 0;
    const chatTotal = (data?.items ?? []).reduce((sum, c) => sum + c.unreadCount, 0);
    const total = attention > 0 ? attention : chatTotal;
    document.title = total > 0 ? `(${total}) ${BASE_TITLE}` : BASE_TITLE;
    // Десктоп-оболочка (#254): тот же счётчик — бейдж трея и панели задач.
    void desktopSetUnreadBadge(total > 0 ? total : null);
  }, [data, queryClient]);

  useEffect(
    () => () => {
      document.title = BASE_TITLE;
    },
    [],
  );
}
