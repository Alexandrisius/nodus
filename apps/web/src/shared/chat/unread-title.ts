import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationSummary } from '@nodus/contracts';

import { api } from '../api-client.js';
import { desktopSetUnreadBadge } from '../desktop/desktop-bridge.js';
import { notificationsKeys } from '../notifications-keys.js';
import { useSocketStatusStore } from '../socket/socket-status-store.js';
import { useChatUnreadSummary } from './chat-queries.js';

/** Базовое имя вкладки (index.html). */
const BASE_TITLE = 'Nodus';

/**
 * Заголовок вкладки (#124 → #100 → #254): приоритет — ВАЖНОЕ из журнала
 * уведомлений (E8), затем непрочитанные чата — точная сводка по всем беседам
 * (#409; сумма первой страницы списка занижала число). Сводка — ЖИВАЯ
 * ПОДПИСКА (useQuery), не снапшот кэша: снапшот застревал на старом
 * attention («зомби-бейдж» #254 — заголовок жил сам по себе), подписка
 * обновляется любой WS-инвалидацией и тащит title за собой; поллинг —
 * страховка при молчащем сокете (канон livePoll чата).
 */
export function useUnreadTitle(): void {
  const { data: unread } = useChatUnreadSummary();
  const queryClient = useQueryClient();
  const socketConnected = useSocketStatusStore((s) => s.connected);
  const { data: summary } = useQuery({
    queryKey: notificationsKeys.summary(),
    queryFn: () => api<NotificationSummary>('/notifications/summary'),
    refetchInterval: socketConnected ? 60_000 : 15_000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    const attention = summary?.attention ?? 0;
    const chatTotal = unread?.total ?? 0;
    const total = attention > 0 ? attention : chatTotal;
    document.title = total > 0 ? `(${total}) ${BASE_TITLE}` : BASE_TITLE;
    // Десктоп-оболочка (#254): тот же счётчик — бейдж панели задач.
    void desktopSetUnreadBadge(total > 0 ? total : null);
  }, [unread, summary, queryClient]);

  useEffect(
    () => () => {
      document.title = BASE_TITLE;
    },
    [],
  );
}
