import type { Notification, NotificationKind, NotificationPriority } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

/**
 * Модель вкладок ленты уведомлений (#189, Slack-паттерн): системные вкладки
 * (Все — защищённая; Срочно; Упоминания) + кастомные вкладки-фильтры
 * пользователя (оси kind и priority независимы, ADR-0017). Правила защиты:
 * «Все» нельзя скрыть, удалить и ей нет ПКМ-меню; системные можно только
 * скрыть; кастомные — переименовать/удалить. Чистые функции — unit-покрыты.
 */

export const SYSTEM_TAB_IDS = ['all', 'urgent', 'mentions'] as const;
export type SystemTabId = (typeof SYSTEM_TAB_IDS)[number];

/** Вкладка «Все» — единственная незакрываемая (спека #189). */
export const PROTECTED_TAB: SystemTabId = 'all';

export interface CustomFeedTab {
  id: string;
  name: string;
  /** Пусто = любой тип события. */
  kinds: NotificationKind[];
  /** Пусто = любой приоритет. */
  priorities: NotificationPriority[];
}

export interface FeedTab {
  id: string;
  label: string;
  system: SystemTabId | null;
  match: (n: Notification) => boolean;
}

const SYSTEM_MATCHERS: Record<SystemTabId, (n: Notification) => boolean> = {
  all: () => true,
  urgent: (n) => n.priority === 'urgent',
  mentions: (n) => n.kind === 'chat.mention',
};

const SYSTEM_LABELS: Record<SystemTabId, string> = {
  all: ui.notifications.pillAll,
  urgent: ui.notifications.pillUrgent,
  mentions: ui.notifications.pillMentions,
};

export function isSystemTabId(id: string): id is SystemTabId {
  return (SYSTEM_TAB_IDS as readonly string[]).includes(id);
}

/** Кастомный фильтр: обе оси независимы, пустой список оси = «любой». */
export function matchesCustomTab(tab: CustomFeedTab, n: Notification): boolean {
  const kindOk = tab.kinds.length === 0 || tab.kinds.includes(n.kind);
  const priorityOk = tab.priorities.length === 0 || tab.priorities.includes(n.priority);
  return kindOk && priorityOk;
}

/** Видимые вкладки: системные минус скрытые, затем кастомные (порядок юзера).
 *  «Все» не скрывается даже при прямом вызове — защита дублирует схему стора. */
export function resolveTabs(custom: CustomFeedTab[], hiddenSystem: string[]): FeedTab[] {
  const hidden = new Set(
    hiddenSystem.filter((id): id is SystemTabId => isSystemTabId(id) && id !== PROTECTED_TAB),
  );
  const system = SYSTEM_TAB_IDS.filter((id) => !hidden.has(id)).map((id) => ({
    id,
    label: SYSTEM_LABELS[id],
    system: id,
    match: SYSTEM_MATCHERS[id],
  }));
  const customTabs = custom.map((t) => ({
    id: t.id,
    label: t.name,
    system: null,
    match: (n: Notification) => matchesCustomTab(t, n),
  }));
  return [...system, ...customTabs];
}

/** Активная вкладка после удаления/скрытия — «Все» (всегда доступна). */
export function ensureActiveTab(activeId: string, tabs: FeedTab[]): string {
  return tabs.some((t) => t.id === activeId) ? activeId : PROTECTED_TAB;
}

/** Название кастомной вкладки: непустое, уместное в строке вкладок. */
export function isValidTabName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= 40;
}
