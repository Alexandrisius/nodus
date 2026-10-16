import type { NotificationKind } from '@nodus/contracts';

/**
 * Адресаты уведомлений о задачах (#37) — чистая функция над событием task.*
 * (I3: notifications знает только payload события, не таблицы задач).
 * Сам себе не уведомляется; наблюдатели — без звука (их канал — чат задачи).
 */
export interface TaskNotice {
  userId: string;
  kind: NotificationKind;
  preview: string;
}

const OPEN = new Set(['backlog', 'active', 'paused']);

type Payload = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const ids = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

export function taskNotices(type: string, p: Payload, actorId: string | null): TaskNotice[] {
  const label = `ПП-${String(p.number)} · ${str(p.title) ?? str(p.toStageName) ?? ''}`.trim();
  const out = new Map<string, TaskNotice>();
  const add = (userId: string | null, kind: NotificationKind) => {
    if (userId && userId !== actorId && !out.has(userId))
      out.set(userId, { userId, kind, preview: label });
  };
  switch (type) {
    case 'task.created':
      add(str(p.assigneeId), 'action.assignment');
      for (const id of ids(p.coexecutorIds)) add(id, 'action.assignment');
      break;
    case 'task.assigned':
      add(str(p.assigneeId), 'action.assignment');
      break;
    case 'task.participants_changed':
      for (const a of Array.isArray(p.added) ? (p.added as Payload[]) : []) {
        if (a.role === 'coexecutor') add(str(a.userId), 'action.assignment');
      }
      break;
    case 'task.stage_changed': {
      const from = str(p.fromState) ?? '';
      const to = str(p.toState) ?? '';
      if (OPEN.has(from) && !OPEN.has(to)) add(str(p.creatorId), 'task.completed');
      if (!OPEN.has(from) && OPEN.has(to)) add(str(p.assigneeId), 'task.returned');
      break;
    }
    case 'task.overdue':
      add(str(p.assigneeId), 'action.deadline');
      add(str(p.creatorId), 'action.deadline');
      break;
  }
  return [...out.values()];
}
