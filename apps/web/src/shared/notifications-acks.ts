import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UrgentAckStatus, UrgentSelfAck } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { api } from './api-client.js';
import { notificationsKeys } from './notifications-keys.js';

/**
 * «Ознакомились N из M» по срочному сообщению (#100) — для мета-строки чата
 * (shared-слой: единой мете нужен хук без импорта features, ADR-паттерн
 * ключей в shared). Live по WS: notification.acked инвалидирует весь
 * notifications-корень, включая этот ключ. Только отправитель (null — не
 * своё сообщение: запрос не шлётся, сервер отдаёт 404 не-автору, #202).
 */
export function useUrgentAcks(messageId: string | null): UrgentAckStatus | undefined {
  const { data } = useQuery({
    queryKey: notificationsKeys.urgentAcks(messageId ?? 'foreign'),
    queryFn: () => api<UrgentAckStatus>(`/notifications/urgent/${messageId}/acks`),
    enabled: messageId !== null,
  });
  return data;
}

/**
 * Свой факт ознакомления по важному (#177): восстановление чипа
 * «Ознакомлен» на пузыре после перезагрузки. null — запрос не шлётся
 * (не получатель requireAck: сервер ответит 404, G3).
 */
export function useSelfUrgentAck(messageId: string | null): UrgentSelfAck | undefined {
  const { data } = useQuery({
    queryKey: notificationsKeys.urgentSelfAck(messageId ?? 'foreign'),
    queryFn: () => api<UrgentSelfAck>(`/notifications/urgent/${messageId}/ack`),
    enabled: messageId !== null,
  });
  return data;
}

/**
 * Ознакомиться из пузыря чата (#177): POST по сообщению (id строки журнала
 * получатель не знает). Оптимистично ставим ackedAt в кэш self-ack — чип
 * «Ознакомлен ✓» гаснет мгновенно (I4); откат при ошибке. Сервер гасит
 * повторы и шлёт будило автору (notification.acked → live-счётчик).
 */
export function useAckUrgentByMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) =>
      api<unknown>(`/notifications/urgent/${messageId}/ack`, { method: 'POST' }),
    onMutate: async (messageId) => {
      await queryClient.cancelQueries({
        queryKey: notificationsKeys.urgentSelfAck(messageId),
      });
      const previous = queryClient.getQueryData<UrgentSelfAck>(
        notificationsKeys.urgentSelfAck(messageId),
      );
      queryClient.setQueryData<UrgentSelfAck>(notificationsKeys.urgentSelfAck(messageId), {
        messageId,
        ackedAt: new Date().toISOString(),
      });
      return { previous };
    },
    onError: (_error, messageId, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(notificationsKeys.urgentSelfAck(messageId), context.previous);
      } else {
        queryClient.removeQueries({ queryKey: notificationsKeys.urgentSelfAck(messageId) });
      }
      toast.error(ui.common.saveError);
    },
    onSuccess: (_data, messageId) => {
      // Прогресс автора («Ознакомились N/M») догоняет сразу; журнал — фоном.
      void queryClient.invalidateQueries({
        queryKey: notificationsKeys.urgentAcks(messageId),
      });
    },
    onSettled: (_data, _error, messageId) => {
      void queryClient.invalidateQueries({
        queryKey: notificationsKeys.urgentSelfAck(messageId),
      });
      void queryClient.invalidateQueries({ queryKey: notificationsKeys.all });
    },
  });
}
