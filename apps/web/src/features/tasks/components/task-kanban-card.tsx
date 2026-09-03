import { MessageSquare } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import type { TaskListItem } from '@nodus/contracts';

import { formatMinutes } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { DeadlineChip } from '../../../shared/ui/deadline-chip.js';

export function TaskKanbanCard({ task }: { task: TaskListItem }) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => void navigate({ to: '/tasks/$taskId', params: { taskId: task.id } })}
      className="paper-card sketch-tilt flex w-full flex-col gap-2 p-3 text-left transition-transform hover:-translate-y-0.5"
    >
      <span className="line-clamp-2 text-sm font-medium">{task.title}</span>
      <DeadlineChip deadline={task.deadline} />
      {task.project ? (
        <span className="truncate text-xs text-info">{task.project.name}</span>
      ) : null}
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        {task.assignee ? (
          <PersonAvatar name={task.assignee.displayName} className="size-6" />
        ) : null}
        <span className="ml-auto inline-flex items-center gap-1">
          <MessageSquare className="size-3.5" />
          {task.commentsCount}
        </span>
        {task.spentMinutes > 0 && <span>{formatMinutes(task.spentMinutes)}</span>}
      </span>
    </button>
  );
}
