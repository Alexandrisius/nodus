import { Mail, MessageSquare } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { ui } from '@nodus/contracts';
import { Badge } from '@nodus/ui/components/badge';
import { Checkbox } from '@nodus/ui/components/checkbox';
import { Separator } from '@nodus/ui/components/separator';
import { Skeleton } from '@nodus/ui/components/skeleton';

import { formatMinutes } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { useTaskDetail } from '../api/tasks-api.js';
import { DeadlineChip } from '../../../shared/ui/deadline-chip.js';
import { TaskDiscussion } from './task-discussion.js';
import { TaskStatusBadge } from './task-status-badge.js';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="flex min-w-0 items-center gap-2 text-sm">{children}</span>
    </div>
  );
}

/** Двухпанельная карточка задачи (§10.2): слева параметры, справа обсуждение. */
export function TaskCard({ taskId }: { taskId: string }) {
  const { data: task, isLoading } = useTaskDetail(taskId);
  const navigate = useNavigate();

  if (isLoading || !task) {
    return (
      <div className="grid h-full grid-cols-2">
        <Skeleton className="h-full" />
        <Skeleton className="h-full" />
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-[1.1fr_1fr]">
      <div className="min-h-0 overflow-y-auto border-r p-5">
        <div className="flex flex-wrap items-center gap-2">
          <TaskStatusBadge stage={task.stage} />
          <Badge variant="outline">{ui.tasks.priority[task.priority]}</Badge>
          {task.source === 'letter' && (
            <Badge variant="secondary" className="bg-warning-soft text-warning">
              <Mail data-icon="inline-start" />
              {ui.tasks.instruction}
            </Badge>
          )}
          {task.source === 'chat_message' && (
            <Badge variant="secondary" className="bg-info-soft text-info">
              <MessageSquare data-icon="inline-start" />
              {ui.tasks.fromChat}
            </Badge>
          )}
        </div>

        <h2 className="mt-3 text-xl font-semibold">{task.title}</h2>

        <div className="mt-4">
          <Field label={ui.tasks.deadline}>
            <DeadlineChip deadline={task.deadline} />
          </Field>
          <Field label={ui.tasks.assignee}>
            {task.assignee ? (
              <>
                <PersonAvatar name={task.assignee.displayName} className="size-6" />
                {task.assignee.displayName}
              </>
            ) : (
              ui.common.notSet
            )}
          </Field>
          <Field label={ui.tasks.creator}>
            <PersonAvatar name={task.creator.displayName} className="size-6" />
            {task.creator.displayName}
          </Field>
          <Field label={ui.tasks.project}>
            {task.project ? (
              <button
                type="button"
                className="truncate text-info hover:underline"
                onClick={() =>
                  void navigate({
                    to: '/tasks/$taskId/project/$projectId',
                    params: { taskId, projectId: task.project?.id ?? '' },
                  })
                }
              >
                {task.project.name}
              </button>
            ) : (
              ui.common.notSet
            )}
          </Field>
          <Field label={ui.tasks.spent}>{formatMinutes(task.spentMinutes)}</Field>
        </div>

        <Separator className="my-3" />

        <h3 className="text-sm font-semibold">{ui.tasks.description}</h3>
        <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
          {task.description}
        </p>

        {task.checklist.length > 0 && (
          <>
            <Separator className="my-3" />
            <h3 className="text-sm font-semibold">
              {ui.tasks.checklist} · {task.checklistDone}/{task.checklistTotal}
            </h3>
            <div className="mt-2 flex flex-col gap-2">
              {task.checklist.map((item) => (
                <label key={item.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={item.done} disabled />
                  <span className={item.done ? 'text-muted-foreground line-through' : ''}>
                    {item.text}
                  </span>
                </label>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="min-h-0">
        <TaskDiscussion taskId={taskId} />
      </div>
    </div>
  );
}
