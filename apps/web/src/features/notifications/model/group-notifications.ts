import type { Notification } from '@nodus/contracts';

/**
 * Группировка ленты по источнику (#100, анти-свалка, канон Telegram):
 * одна строка на диалог/тред со своим счётчиком (E4) — чистая функция,
 * порядок внутри групп сохраняется (последнее сверху, seq DESC от сервера).
 * Срочные НЕ группируются — каждое требует отдельного ознакомления.
 */
export interface NotificationGroup {
  key: string;
  latest: Notification;
  count: number;
}

export function groupNotifications(items: Notification[]): NotificationGroup[] {
  const groups = new Map<string, NotificationGroup>();
  for (const item of items) {
    if (item.tier === 'urgent') {
      groups.set(item.id, { key: item.id, latest: item, count: 1 });
      continue;
    }
    const key = item.conversationId ?? item.sourceId;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(key, { key, latest: item, count: 1 });
    }
  }
  return [...groups.values()];
}

/** Порядок секции внимания: срочно → личное → действия (иерархия ярусов). */
export const TIER_ORDER = { urgent: 0, personal: 1, action: 2, background: 3 } as const;

export function tierOfLatest(group: NotificationGroup): Notification['tier'] {
  return group.latest.tier;
}

export function sortAttentionGroups(groups: NotificationGroup[]): NotificationGroup[] {
  return [...groups].sort((a, b) => TIER_ORDER[a.latest.tier] - TIER_ORDER[b.latest.tier]);
}

/** Cap отображения счётчиков (E9): «999+». */
export function formatCount(n: number): string {
  return n > 999 ? '999+' : String(n);
}
