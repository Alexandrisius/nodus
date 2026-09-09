import { Mail, MessageSquare, Plus } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { TaskChainNode } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Checkbox } from '@nodus/ui/components/checkbox';
import { Input } from '@nodus/ui/components/input';
import { NodeChip } from '@nodus/ui/components/node-chip';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { Separator } from '@nodus/ui/components/separator';
import { Skeleton } from '@nodus/ui/components/skeleton';

import { formatDateTime, formatMinutes } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { DeadlineChip } from '../../../shared/ui/deadline-chip.js';
import { DomainChain, type ChainNode } from '../../../shared/ui/domain-chain.js';
import { useAddSubtask, useTaskDetail } from '../api/tasks-api.js';
import { priorityTone } from '../lib/task-fields.js';
import { TaskSidePanel } from './task-side-panel.js';
import { TaskStatusBadge } from './task-status-badge.js';

const chainCaption: Record<TaskChainNode['kind'], string> = {
  letter: ui.letters.letter,
  resolution: ui.letters.resolution,
  instruction: ui.tasks.instruction,
  task: ui.tasks.task,
  chat_message: ui.tasks.chatNode,
};

/** Атрибут карточки: моно-метка сверху, значение снизу (сетка 2 колонки). */
function Attr({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </span>
      <span className="flex min-w-0 items-center gap-2 text-sm">{children}</span>
    </div>
  );
}

/**
 * Карточка задачи (универсальный слайдер-слой): шапка — доменная цепочка
 * происхождения (Письмо → Резолюция → Поручение → Задача); слева — название,
 * доска атрибутов сеткой, описание, подзадачи в один клик и чек-лист; справа —
 * узкая панель быстрой навигации (обсуждение/файлы/ссылки/история).
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
      <div className="grid h-full grid-cols-[minmax(0,1fr)_400px]">
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

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-h-0 overflow-y-auto p-6">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="min-w-0 flex-1 truncate text-xl font-semibold">{task.title}</h2>
            {task.source === 'letter' ? (
              <NodeChip tone="info">
                <Mail className="size-3" />
                {ui.tasks.instruction}
              </NodeChip>
            ) : task.source === 'chat_message' ? (
              <NodeChip tone="info">
                <MessageSquare className="size-3" />
                {ui.tasks.fromChat}
              </NodeChip>
            ) : null}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-x-10 gap-y-4">
            <Attr label={ui.tasks.fieldStage}>
              <TaskStatusBadge stage={task.stage} />
            </Attr>
            <Attr label={ui.tasks.fieldPriority}>
              <NodeChip tone={priorityTone[task.priority]}>
                {ui.tasks.priority[task.priority]}
              </NodeChip>
            </Attr>
            <Attr label={ui.tasks.deadline}>
              <DeadlineChip deadline={task.deadline} />
            </Attr>
            <Attr label={ui.tasks.assignee}>
              {task.assignee ? (
                <>
                  <PersonAvatar name={task.assignee.displayName} className="size-6" />
                  <span className="truncate">{task.assignee.displayName}</span>
                </>
              ) : (
                ui.common.notSet
              )}
            </Attr>
            <Attr label={ui.tasks.creator}>
              <PersonAvatar name={task.creator.displayName} className="size-6" />
              <span className="truncate">{task.creator.displayName}</span>
            </Attr>
            <Attr label={ui.tasks.project}>
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
            </Attr>
            <Attr label={ui.tasks.spent}>
              <span className="font-mono text-[12px] tabular-nums">
                {formatMinutes(task.spentMinutes)}
              </span>
            </Attr>
            <Attr label={ui.tasks.created}>
              <span className="font-mono text-[12px] tabular-nums">
                {formatDateTime(task.createdAt)}
              </span>
            </Attr>
          </div>

          <Separator className="my-5" />

          <NodeLabel label={ui.tasks.description} />
          <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
            {task.description}
          </p>

          <Separator className="my-5" />

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
              <Separator className="my-5" />
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

        <TaskSidePanel task={task} />
      </div>
    </div>
  );
}
