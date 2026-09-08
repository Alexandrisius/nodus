import { CornerDownRight, Mail, MessageSquare } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import type { TaskListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { formatMinutes } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { DeadlineChip } from '../../../shared/ui/deadline-chip.js';
import { useShellStore } from '../../../app/shell/shell-store.js';

/** Карточка канбана: node-панель, моно-ключ, маркер подзадачи (связь к
 * родителю), чип срока, проект, аватар и счётчики. Клик — слайдер с
 * док-ребром от левого края карточки. */
export function TaskKanbanCard({
  task,
  parentNumber,
}: {
  task: TaskListItem;
  parentNumber?: number;
}) {
  const navigate = useNavigate();
  const setLastDock = useShellStore((s) => s.setLastDock);

  return (
    <button
      type="button"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setLastDock({ x: rect.left, y: rect.top + rect.height / 2 });
        void navigate({ to: '/tasks/$taskId', params: { taskId: task.id } });
      }}
      className="node-panel flex w-full flex-col gap-2 p-3 text-left transition-colors hover:border-input"
    >
      {parentNumber !== undefined ? (
        <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
          <CornerDownRight className="size-3" />
          {ui.tasks.subtaskOf} · {parentNumber}
        </span>
      ) : null}
      <span className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
          № {task.number}
        </span>
        {task.source === 'letter' ? (
          <Mail className="size-3.5 text-info/70" aria-label={ui.tasks.fromLetter} />
        ) : null}
        {task.source === 'chat_message' ? (
          <MessageSquare className="size-3.5 text-info/70" aria-label={ui.tasks.fromChat} />
        ) : null}
      </span>
      <span className="line-clamp-2 text-sm font-medium">{task.title}</span>
      <DeadlineChip deadline={task.deadline} />
      {task.project ? (
        <span className="truncate font-mono text-[11px] text-info/80">{task.project.name}</span>
      ) : null}
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        {task.assignee ? (
          <PersonAvatar name={task.assignee.displayName} className="size-6" />
        ) : null}
        <span className="ml-auto inline-flex items-center gap-1 font-mono text-[11px] tabular-nums">
          <MessageSquare className="size-3.5" />
          {task.commentsCount}
        </span>
        {task.spentMinutes > 0 ? (
          <span className="font-mono text-[11px] tabular-nums">
            {formatMinutes(task.spentMinutes)}
          </span>
        ) : null}
      </span>
    </button>
  );
}
