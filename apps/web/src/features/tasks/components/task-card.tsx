import { Mail, MessageSquare, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { TaskChainNode, TaskPriority } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Checkbox } from '@nodus/ui/components/checkbox';
import { Input } from '@nodus/ui/components/input';
import { NodeChip } from '@nodus/ui/components/node-chip';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { Separator } from '@nodus/ui/components/separator';
import { Skeleton } from '@nodus/ui/components/skeleton';

import { formatMinutes } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { DeadlineChip } from '../../../shared/ui/deadline-chip.js';
import { DomainChain, type ChainNode } from '../../../shared/ui/domain-chain.js';
import { useAddSubtask, useTaskDetail } from '../api/tasks-api.js';
import { TaskAbout } from './task-about.js';
import { TaskDiscussion } from './task-discussion.js';
import { TaskStatusBadge } from './task-status-badge.js';

const chainCaption: Record<TaskChainNode['kind'], string> = {
  letter: ui.letters.letter,
  resolution: ui.letters.resolution,
  instruction: ui.tasks.instruction,
  task: ui.tasks.task,
  chat_message: ui.tasks.chatNode,
};

const priorityTone: Record<TaskPriority, 'muted' | 'warning' | 'danger'> = {
  low: 'muted',
  normal: 'muted',
  high: 'warning',
  urgent: 'danger',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-24 shrink-0 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </span>
      <span className="flex min-w-0 items-center gap-2 text-sm">{children}</span>
    </div>
  );
}

/**
 * Карточка задачи (большой нижний слайдер): шапка — доменная цепочка
 * происхождения (Письмо → Резолюция → Поручение → Задача); слева — чипы,
 * описание, параметры, подзадачи в один клик и чек-лист; центр — обсуждение;
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

  const chainNodes: ChainNode[] = task.chain.map((node, i) => ({
    caption: chainCaption[node.kind],
    ref: node.ref,
    label: node.label,
    state: node.state,
    active: i === task.chain.length - 1,
    onClick:
      node.kind === 'letter' && node.entityId
        ? () =>
            void navigate({
              to: '/letters/$letterId',
              params: { letterId: node.entityId ?? '' },
            })
        : undefined,
  }));

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 overflow-x-auto border-b border-border px-5 py-3">
        <DomainChain nodes={chainNodes} />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[380px_minmax(0,1fr)_300px]">
        <div className="min-h-0 overflow-y-auto border-r border-border p-5">
          <div className="flex flex-wrap items-center gap-2">
            <TaskStatusBadge stage={task.stage} />
            <NodeChip tone={priorityTone[task.priority]}>
              {ui.tasks.priority[task.priority]}
            </NodeChip>
            {task.source === 'letter' ? (
              <NodeChip tone="info">
                <Mail className="size-3" />
                {ui.tasks.instruction}
              </NodeChip>
            ) : null}
            {task.source === 'chat_message' ? (
              <NodeChip tone="info">
                <MessageSquare className="size-3" />
                {ui.tasks.fromChat}
              </NodeChip>
            ) : null}
          </div>

          <h2 className="mt-3 text-lg font-semibold">{task.title}</h2>

          <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
            {task.description}
          </p>

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
                  className="truncate font-mono text-[12px] text-info hover:underline"
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
            <Field label={ui.tasks.spent}>
              <span className="font-mono text-[12px] tabular-nums">
                {formatMinutes(task.spentMinutes)}
              </span>
            </Field>
          </div>

          <Separator className="my-4" />

          <NodeLabel label={ui.tasks.subtasks} count={task.subtasks.length} />
          <div className="mt-2.5 flex flex-col gap-1.5">
            {task.subtasks.map((subtask) => (
              <button
                key={subtask.id}
                type="button"
                onClick={() =>
                  void navigate({
                    to: '/tasks/$taskId',
                    params: { taskId: subtask.id },
                    search: (prev) => prev,
                  })
                }
                className="flex items-center gap-2 rounded-md px-1 py-1 text-left text-sm hover:bg-accent/50"
              >
                <span className="size-1.5 shrink-0 rounded-full bg-port" />
                <span className="min-w-0 flex-1 truncate">{subtask.title}</span>
                <TaskStatusBadge stage={subtask.stage} />
              </button>
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

          {task.checklist.length > 0 ? (
            <>
              <Separator className="my-4" />
              <NodeLabel label={ui.tasks.checklist} count={task.checklist.length} />
              <div className="mt-2.5 flex flex-col gap-2">
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
          ) : null}
        </div>

        <div className="min-h-0 bg-background">
          <TaskDiscussion taskId={taskId} />
        </div>

        <TaskAbout task={task} />
      </div>
    </div>
  );
}
