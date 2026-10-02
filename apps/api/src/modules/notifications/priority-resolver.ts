import type { NotificationKind, NotificationPriority } from '@nodus/contracts';

/**
 * Резолвер приоритетов (ADR-0016 §3 → ADR-0017): чистая функция — каждое
 * правило покрыто unit-тестом. Вход — нормализованное событие chat.message_sent
 * + состав беседы; выход — адресаты с приоритетом и kind. Подавления snooze/
 * DND/«открытый чат» — клиентские (контекст вкладки), сервер честно пишет
 * журнал. Ось kind («что случилось») и ось priority («насколько важно»)
 * независимы: важность решает таблица ниже, не смысл события.
 */

export interface ResolvedNotification {
  userId: string;
  priority: NotificationPriority;
  kind: NotificationKind;
}

export interface MessageEventInput {
  conversationType: 'direct' | 'group' | 'project_channel' | 'task' | 'letter';
  authorId: string;
  /** «Важное сообщение»: всем получателям urgent, mute не понижает. */
  urgent: boolean;
  /** userId упомянутых (снапшот отправки, без автора — фильтр здесь). */
  mentionedUserIds: string[];
  /** Наблюдатели треда (author/replier/watcher/mentioned корня). */
  threadWatcherIds: string[];
  /** Состав беседы с mute-флагами (read-порт чата). */
  members: { userId: string; muted: boolean }[];
}

/**
 * Декларативная таблица kind → priority (вердикт владельца 02.10, ADR-0017):
 * смена важности любого события = правка ОДНОЙ строки, без перепроектирования.
 * Тип Record<NotificationKind, …> гарантирует полноту компилятором — новый
 * kind без строки не соберётся. Значения на старт #189 сохраняют поведение
 * прежних ярусов 1:1 (personal→high, action→medium, background→low).
 */
export const KIND_PRIORITY: Record<NotificationKind, NotificationPriority> = {
  'urgent.message': 'urgent',
  'chat.direct_message': 'high',
  'chat.mention': 'high',
  'chat.thread_reply': 'high',
  'chat.channel_post': 'low',
  'chat.message_edited': 'low',
  'action.assignment': 'medium',
  'action.approval': 'medium',
  'action.deadline': 'medium',
};

/** Приоритет kind при пересечении правил (urgent > mention > thread > direct > channel). */
function kindFor(
  input: MessageEventInput,
  userId: string,
  mentioned: Set<string>,
  threadWatchers: Set<string>,
): NotificationKind {
  if (input.urgent) return 'urgent.message';
  if (mentioned.has(userId)) return 'chat.mention';
  if (threadWatchers.has(userId)) return 'chat.thread_reply';
  if (input.conversationType === 'direct') return 'chat.direct_message';
  return 'chat.channel_post';
}

/**
 * Механики поверх таблицы:
 * 1. Автор события → skip (себя не уведомляем, B9).
 * 2. urgent → всем получателям urgent (пробивает mute, B5).
 * 3. Mute понижает приоритет до low (точка без числа); urgent не понижает.
 */
export function resolveMessageNotifications(input: MessageEventInput): ResolvedNotification[] {
  const mentioned = new Set(input.mentionedUserIds.filter((id) => id !== input.authorId));
  const threadWatchers = new Set(input.threadWatcherIds.filter((id) => id !== input.authorId));

  const resolved = new Map<string, ResolvedNotification>();
  for (const member of input.members) {
    if (member.userId === input.authorId) continue;
    const kind = kindFor(input, member.userId, mentioned, threadWatchers);
    const tablePriority = KIND_PRIORITY[kind];
    const priority: NotificationPriority =
      member.muted && tablePriority !== 'urgent' ? 'low' : tablePriority;
    resolved.set(member.userId, { userId: member.userId, priority, kind });
  }
  return [...resolved.values()];
}
