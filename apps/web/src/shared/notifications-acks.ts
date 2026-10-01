import { useQuery } from '@tanstack/react-query';
import type { UrgentAckStatus } from '@nodus/contracts';

import { api } from './api-client.js';
import { notificationsKeys } from './notifications-keys.js';

/**
 * «Ознакомились N из M» по срочному сообщению (#100) — для мета-строки чата
 * (shared-слой: единой мете нужен хук без импорта features, ADR-паттерн
 * ключей в shared). Live по WS: notification.acked инвалидирует весь
 * notifications-корень, включая этот ключ.
 */
export function useUrgentAcks(messageId: string): UrgentAckStatus | undefined {
  const { data } = useQuery({
    queryKey: notificationsKeys.urgentAcks(messageId),
    queryFn: () => api<UrgentAckStatus>(`/notifications/urgent/${messageId}/acks`),
  });
  return data;
}
