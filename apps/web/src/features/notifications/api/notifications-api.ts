import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  ListNotificationsQuery,
  Notification,
  NotificationFilter,
  NotificationPage,
  NotificationSettings,
  NotificationSummary,
  UrgentAckStatus,
} from '@nodus/contracts';

import { api } from '../../../shared/api-client.js';
import { notificationsKeys } from '../../../shared/notifications-keys.js';

/** Канонические ключи — shared (второй потребитель: сокет-инвалидатор). */
export { notificationsKeys };

/** Лента журнала (фильтры пилюль + поиск; дельта afterSeq — сокетом). */
export function useNotifications(filter: NotificationFilter, q?: string) {
  return useQuery({
    queryKey: notificationsKeys.list(filter, q),
    queryFn: () => {
      const params = new URLSearchParams({ filter });
      if (q !== undefined && q.length > 0) params.set('q', q);
      return api<NotificationPage>(`/notifications?${params.toString()}`);
    },
  });
}

/** Сводка «число + точка» (колокольчик, рейка, document.title). */
export function useNotificationSummary() {
  return useQuery({
    queryKey: notificationsKeys.summary(),
    queryFn: () => api<NotificationSummary>('/notifications/summary'),
  });
}

export function useNotificationSettings() {
  return useQuery({
    queryKey: notificationsKeys.settings(),
    queryFn: () => api<NotificationSettings>('/notifications/settings'),
  });
}

/** «Ознакомились N из M» по срочному сообщению (отправитель, live по WS). */
export function useUrgentAcks(messageId: string) {
  return useQuery({
    queryKey: notificationsKeys.urgentAcks(messageId),
    queryFn: () => api<UrgentAckStatus>(`/notifications/urgent/${messageId}/acks`),
  });
}

/** Прочитать одно (E3): оптимистично — строка уходит из всех закэшированных
 *  страниц журнала и счётчик яруса гасится ДО ответа сервера (I4, < 100 мс),
 *  откат при ошибке; срочное читается только ознакомлением. */
export function useReadNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<Notification>(`/notifications/${id}/read`, { method: 'POST' }),
    onMutate: async (id) => applyGone(queryClient, id),
    onError: (_error, _id, context) => rollbackGone(queryClient, context),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationsKeys.all });
    },
  });
}

/** Ознакомление со срочным (СЭД-паттерн): строка уходит из секции, счётчик -1. */
export function useAckNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<Notification>(`/notifications/${id}/ack`, { method: 'POST' }),
    onMutate: async (id) => applyGone(queryClient, id),
    onError: (_error, _id, context) => rollbackGone(queryClient, context),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationsKeys.all });
    },
  });
}

/** Снапшот кэша для откката оптимистичного гашения одной записи. */
interface GoneSnapshot {
  lists: Array<[readonly unknown[], NotificationPage | undefined]>;
  summary: NotificationSummary | undefined;
}

/** Ключ страницы-истории журнала (filter='all') — ридер держит запись в ней. */
function isHistoryListKey(key: unknown): boolean {
  return Array.isArray(key) && key[0] === 'notifications' && key[1] === 'list' && key[2] === 'all';
}

/** Убрать запись из кэша журнала до ответа сервера: страницы живых фильтров
 *  (attention/mentions/…) фильтруются по id, сводка −1 по ярусу записи.
 *  История 'all' НЕ трогается — ридер держит открытую запись и после
 *  гашения (запись читается из журнала-истории до инвалидации). */
function applyGone(queryClient: QueryClient, id: string): GoneSnapshot {
  const lists = queryClient.getQueriesData<NotificationPage>({
    queryKey: notificationsKeys.all,
  });
  const priority =
    lists.flatMap(([, page]) => page?.items ?? []).find((n) => n.id === id)?.priority ?? null;
  const summary = queryClient.getQueryData<NotificationSummary>(notificationsKeys.summary());
  for (const [key, page] of lists) {
    if (!page || !Array.isArray(page.items) || isHistoryListKey(key)) continue;
    queryClient.setQueryData(key, {
      ...page,
      items: page.items.filter((n) => n.id !== id),
    } satisfies NotificationPage);
  }
  if (summary && priority) {
    queryClient.setQueryData(notificationsKeys.summary(), {
      ...summary,
      attention: Math.max(0, summary.attention - (priority === 'low' ? 0 : 1)),
      urgent: Math.max(0, summary.urgent - (priority === 'urgent' ? 1 : 0)),
      high: Math.max(0, summary.high - (priority === 'high' ? 1 : 0)),
      medium: Math.max(0, summary.medium - (priority === 'medium' ? 1 : 0)),
    } satisfies NotificationSummary);
  }
  return { lists, summary };
}

function rollbackGone(queryClient: QueryClient, snapshot: GoneSnapshot | undefined): void {
  if (!snapshot) return;
  for (const [key, page] of snapshot.lists) {
    queryClient.setQueryData(key, page);
  }
  if (snapshot.summary) {
    queryClient.setQueryData(notificationsKeys.summary(), snapshot.summary);
  }
}

export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<NotificationSettings>) =>
      api<NotificationSettings>('/notifications/settings', { method: 'PATCH', body }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationsKeys.settings() });
    },
  });
}

/** Дельта после reconnect (D1/D3): добор журнала по seq без полной перезагрузки. */
export async function fetchNotificationDelta(afterSeq: number): Promise<NotificationPage> {
  return api<NotificationPage>(`/notifications?afterSeq=${afterSeq}&filter=all&limit=100`);
}

export type { ListNotificationsQuery };
