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
};
