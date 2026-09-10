import {
  CalendarClock,
  CalendarPlus,
  Flag,
  FolderKanban,
  Timer,
  User,
  UserPen,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { TaskDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { formatDateTime, formatMinutes } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { DeadlineChip } from '../../../shared/ui/deadline-chip.js';
import { NodeChip } from '@nodus/ui/components/node-chip';
import { priorityTone } from '../lib/task-fields.js';

/** Инспектор полей карточки (референс ClickUp, грамматика «Инструмента»):
 *  чистые строки «иконка + метка / значение» без табличных рамок.
 *  Сетка на container queries: узкая левая панель — 1 колонка, широкая — 2;
 *  зазор между колонками фиксирован, поля тянутся до max-w, дальше растут
 *  боковые отступы и блок центрируется (mx-auto) — плавно при ресайзе чата. */
export function TaskFields({ task }: { task: TaskDetail }) {
  const navigate = useNavigate();

  return (
    <div className="mx-auto mt-5 grid max-w-3xl grid-cols-1 gap-x-12 gap-y-0.5 @min-[640px]:grid-cols-2">
      <Field icon={<Flag className="size-3.5" />} label={ui.tasks.fieldPriority}>
        <NodeChip tone={priorityTone[task.priority]}>{ui.tasks.priority[task.priority]}</NodeChip>
      </Field>
      <Field icon={<CalendarClock className="size-3.5" />} label={ui.tasks.deadline}>
        <DeadlineChip deadline={task.deadline} />
      </Field>
      <Field icon={<User className="size-3.5" />} label={ui.tasks.assignee}>
        {task.assignee ? (
          <>
            <PersonAvatar name={task.assignee.displayName} className="size-6" />
            <span className="truncate">{task.assignee.displayName}</span>
          </>
        ) : (
          ui.common.notSet
        )}
      </Field>
      <Field icon={<UserPen className="size-3.5" />} label={ui.tasks.creator}>
        <PersonAvatar name={task.creator.displayName} className="size-6" />
        <span className="truncate">{task.creator.displayName}</span>
      </Field>
      <Field icon={<Users className="size-3.5" />} label={ui.tasks.participants}>
        {task.participants.length > 0 ? (
          <>
            <span className="flex shrink-0 -space-x-1.5">
              {task.participants.slice(0, 3).map((p) => (
                <PersonAvatar key={p.id} name={p.displayName} className="size-6 ring-2 ring-card" />
              ))}
            </span>
            <span className="truncate">
              {task.participants.map((p) => p.displayName).join(', ')}
            </span>
          </>
        ) : (
          ui.common.notSet
        )}
      </Field>
      <Field icon={<FolderKanban className="size-3.5" />} label={ui.tasks.project}>
        {task.project ? (
          <button
            type="button"
            className="truncate font-mono text-[12px] text-info hover:underline"
            onClick={() =>
              void navigate({
                to: '/tasks/$taskId/project/$projectId',
                params: { taskId: task.id, projectId: task.project?.id ?? '' },
              })
            }
          >
            {task.project.name}
          </button>
        ) : (
          ui.common.notSet
        )}
      </Field>
      <Field icon={<Timer className="size-3.5" />} label={ui.tasks.spent}>
        <span className="font-mono text-[12px] tabular-nums">
          {formatMinutes(task.spentMinutes)}
        </span>
      </Field>
      <Field icon={<CalendarPlus className="size-3.5" />} label={ui.tasks.created}>
        <span className="font-mono text-[12px] tabular-nums">{formatDateTime(task.createdAt)}</span>
      </Field>
    </div>
  );
}

function Field({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent/40">
      <span className="flex w-44 shrink-0 items-center gap-2 font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
        <span aria-hidden className="shrink-0 opacity-70">
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">{children}</span>
    </div>
  );
}
