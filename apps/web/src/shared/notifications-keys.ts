import type { NotificationFilter } from '@nodus/contracts';

/**
 * Канонические ключи журнала уведомлений в shared-слое (#100): второй
 * потребитель после features/notifications — сокет-инвалидатор (shared не
 * импортирует features; factory в фиче реэкспортирует эти ключи).
 */
export const notificationsKeys = {
  all: ['notifications'] as const,
  list: (filter: NotificationFilter, q?: string) =>
    q === undefined
      ? [...notificationsKeys.all, 'list', filter]
      : [...notificationsKeys.all, 'list', filter, q],
  summary: () => [...notificationsKeys.all, 'summary'],
  settings: () => [...notificationsKeys.all, 'settings'],
  urgentAcks: (messageId: string) => [...notificationsKeys.all, 'urgentAcks', messageId],
  /** Свой ack по важному (#177): восстановление чипа «Ознакомлен» после F5. */
  urgentSelfAck: (messageId: string) => [...notificationsKeys.all, 'urgentSelfAck', messageId],
};
