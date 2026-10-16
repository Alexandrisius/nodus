import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { api } from '../api-client.js';
import { notificationsKeys } from '../notifications-keys.js';
import { isDomainMocked } from './api-mock-config.js';

/** Открыта карточка сущности (#252): её уведомления у пользователя
 *  прочитаны — журнал, бейдж и «Требуют внимания» гаснут (сервер эмитит
 *  notification.read, кэши ленты перечитываются штатным конвейером).
 *  Один вызов на открытие сущности; ошибки — тихо (гашение не критично). */
export function useReadEntityNotifications(sourceType: 'task' | 'letter', sourceId: string) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!sourceId || sourceId.startsWith('temp-') || isDomainMocked('notifications')) return;
    void api<{ read: number }>('/notifications/read-by-source', {
      method: 'POST',
      body: { sourceType, sourceId },
    })
      .then((r) => {
        if (r.read > 0) void queryClient.invalidateQueries({ queryKey: notificationsKeys.all });
      })
      .catch(() => {});
  }, [queryClient, sourceType, sourceId]);
}
