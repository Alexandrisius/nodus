import { useNavigate } from '@tanstack/react-router';
import { ui } from '@nodus/contracts';

import { formatMinutes } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { Skeleton } from '@nodus/ui/components/skeleton';

import { useTasksList } from '../api/tasks-api.js';
import { DeadlineChip } from '../../../shared/ui/deadline-chip.js';
import { TaskStatusBadge } from './task-status-badge.js';

/** Список задач (табличный вид, как «Список» в Битриксе). */
export function TaskList() {
  const { data, isLoading } = useTasksList();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 p-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="grid grid-cols-[5rem_1fr_14rem_10rem_10rem_6rem] items-center gap-3 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>ID</span>
          <span>{ui.tasks.title}</span>
          <span>{ui.tasks.deadline}</span>
          <span>{ui.tasks.assignee}</span>
          <span>{ui.tasks.comments}</span>
          <span>{ui.tasks.spent}</span>
        </div>
        {(data?.items ?? []).map((task) => (
          <button
            key={task.id}
            type="button"
            onClick={() => void navigate({ to: '/tasks/$taskId', params: { taskId: task.id } })}
            className="grid w-full grid-cols-[5rem_1fr_14rem_10rem_10rem_6rem] items-center gap-3 border-b px-4 py-2.5 text-left last:border-b-0 hover:bg-accent/50"
          >
            <span className="text-xs text-muted-foreground">{task.number}</span>
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-medium">{task.title}</span>
              <TaskStatusBadge stage={task.stage} />
            </span>
            <DeadlineChip deadline={task.deadline} />
            <span className="flex items-center gap-2 text-sm">
              {task.assignee ? (
                <>
                  <PersonAvatar name={task.assignee.displayName} className="size-6" />
                  <span className="truncate">{task.assignee.displayName}</span>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">{ui.common.notSet}</span>
              )}
            </span>
            <span className="text-sm text-muted-foreground tabular-nums">{task.commentsCount}</span>
            <span className="text-sm text-muted-foreground tabular-nums">
              {task.spentMinutes > 0 ? formatMinutes(task.spentMinutes) : '—'}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
