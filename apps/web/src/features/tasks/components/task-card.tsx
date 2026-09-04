import { Mail, MessageSquare, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ui } from '@nodus/contracts';
import { Badge } from '@nodus/ui/components/badge';
import { Checkbox } from '@nodus/ui/components/checkbox';
import { Input } from '@nodus/ui/components/input';
import { Separator } from '@nodus/ui/components/separator';
import { Skeleton } from '@nodus/ui/components/skeleton';

import { formatMinutes } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { DeadlineChip } from '../../../shared/ui/deadline-chip.js';
import { useAddSubtask, useTaskDetail } from '../api/tasks-api.js';
import { TaskAbout } from './task-about.js';
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

/**
 * Карточка задачи (большой нижний слайдер): слева сверху описание и основные
 * параметры, слева снизу — доп. атрибуты и подзадачи в один клик; центр — чат;
 * справа — панель «О задаче».
 */
export function TaskCard({ taskId }: { taskId: string }) {
  const { data: task, isLoading } = useTaskDetail(taskId);
  const addSubtask = useAddSubtask(taskId);
  const navigate = useNavigate();
  const [subtaskTitle, setSubtaskTitle] = useState('');

  function onAddSubtask(event: FormEvent) {
    event.preventDefault();
    const title = subtaskTitle.trim();
    if (!title || addSubtask.isPending) return;
    setSubtaskTitle('');
    addSubtask.mutate(title);
  }

  if (isLoading || !task) {
    return (
      <div className="grid h-full grid-cols-3">
        <Skeleton className="h-full" />
        <Skeleton className="h-full" />
        <Skeleton className="h-full" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-5">
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

        <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">{task.description}</p>

        <div className="mt-3">
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

        <h3 className="text-sm font-semibold">
          {ui.tasks.subtasks} · {task.subtasks.length}
        </h3>
        <div className="mt-2 flex flex-col gap-1.5">
          {task.subtasks.map((subtask) => (
            <div key={subtask.id} className="flex items-center gap-2 text-sm">
              <span className="size-1.5 shrink-0 rounded-full bg-info" />
              <span className="min-w-0 flex-1 truncate">{subtask.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{subtask.stage.name}</span>
            </div>
          ))}
        </div>
        <form onSubmit={onAddSubtask} className="mt-2 flex items-center gap-2">
          <Input
            value={subtaskTitle}
            onChange={(e) => setSubtaskTitle(e.target.value)}
            placeholder={ui.tasks.subtaskPlaceholder}
            className="h-8 text-sm"
          />
          <button
            type="submit"
            disabled={!subtaskTitle.trim()}
            aria-label={ui.tasks.subtasks}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40"
          >
            <Plus className="size-4" />
          </button>
        </form>

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

      <div className="h-96 border-y border-pencil/30">
        <TaskDiscussion taskId={taskId} />
      </div>

      <TaskAbout task={task} />
    </div>
  );
}
