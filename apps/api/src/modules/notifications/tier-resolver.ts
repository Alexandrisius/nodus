import type { NotificationKind, NotificationTier } from '@nodus/contracts';

/**
 * Ярусный резолвер (ADR-0016 §3): чистая функция-таблица решений — каждое
 * правило покрыто unit-тестом (M3). Вход — нормализованное событие
 * chat.message_sent + состав беседы; выход — адресаты с ярусом и kind.
 * Подавления snooze/DND/«открытый чат» — клиентские (контекст вкладки),
 * сервер честно пишет журнал.
 */

export interface ResolvedNotification {
  userId: string;
  tier: NotificationTier;
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
 * Таблица решений:
 * 1. Автор события → skip (себя не уведомляем, B9).
 * 2. urgent → всем получателям urgent (пробивает mute, B5/таблица ярусов).
 * 3. direct → personal (muted → background, B3).
 * 4. @упоминание → personal (muted → background).
 * 5. Ответ в треде → участникам треда personal (thread-follow, B8).
 * 6. Прочие члены группы/канала → background (B2).
 */
export function resolveMessageNotifications(input: MessageEventInput): ResolvedNotification[] {
  const mentioned = new Set(input.mentionedUserIds.filter((id) => id !== input.authorId));
  const threadWatchers = new Set(input.threadWatcherIds.filter((id) => id !== input.authorId));

  const resolved = new Map<string, ResolvedNotification>();
  for (const member of input.members) {
    if (member.userId === input.authorId) continue;
    const kind = kindFor(input, member.userId, mentioned, threadWatchers);
    const isUrgent = input.urgent;
    const isPersonal =
      kind === 'chat.direct_message' || kind === 'chat.mention' || kind === 'chat.thread_reply';
    // Mute понижает до фона (точка без числа); срочное mute пробивает.
    const tier: NotificationTier = isUrgent
      ? 'urgent'
      : isPersonal && !member.muted
        ? 'personal'
        : 'background';
    resolved.set(member.userId, { userId: member.userId, tier, kind });
  }
  return [...resolved.values()];
}
