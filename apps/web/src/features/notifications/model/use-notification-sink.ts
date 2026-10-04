import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { registerNotificationSink } from '../../../shared/socket/notification-bridge.js';
import { notificationsKeys } from '../../../shared/notifications-keys.js';
import { useNotificationsToastStore } from './toast-store.js';

/**
 * Приём живых будил журнала (#100): монтируется в AppShell (пока живой
 * сокет), регистрирует мост shared→фича: тосты по ярусу + инвалидация
 * сводки/ленты (сервер — истина). Размонтирование снимает синк тихо.
 */
export function useNotificationSink(): void {
  const queryClient = useQueryClient();
  const push = useNotificationsToastStore((s) => s.push);

  useEffect(() => {
    registerNotificationSink({
      dispatched: (snapshot, attempt) => {
        push(snapshot, attempt);
        void queryClient.invalidateQueries({ queryKey: notificationsKeys.summary() });
        void queryClient.invalidateQueries({ queryKey: notificationsKeys.all });
      },
      read: () => {
        void queryClient.invalidateQueries({ queryKey: notificationsKeys.summary() });
      },
    });
    return () => registerNotificationSink(null);
  }, [push, queryClient]);
}
