import { Mail, MessageSquare, PanelRight, Plus } from 'lucide-react';
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
import { cn } from '@nodus/ui/lib/utils';

import { formatDateTime, formatMinutes } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { DeadlineChip } from '../../../shared/ui/deadline-chip.js';
import { DomainChain, type ChainNode } from '../../../shared/ui/domain-chain.js';
import { useAddSubtask, useTaskDetail } from '../api/tasks-api.js';
import { priorityTone } from '../lib/task-fields.js';
import { useCardChatWidth } from '../lib/use-card-chat-width.js';
import { TaskAboutDrawer } from './task-about-drawer.js';
import { TaskDiscussion } from './task-discussion.js';
import { TaskStageStepper } from './task-stage-stepper.js';
import { TaskStatusBadge } from './task-status-badge.js';

const chainCaption: Record<TaskChainNode['kind'], string> = {
  letter: ui.letters.letter,
  resolution: ui.letters.resolution,
  instruction: ui.tasks.instruction,
  task: ui.tasks.task,
  chat_message: ui.tasks.chatNode,
};

/** Строка «инспектора»: моно-метка слева, значение справа; плотно, в одну
 *  колонку, hairline-разделители — свойства читаются таблицей, не сеткой. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <span className="w-36 shrink-0 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">{children}</span>
    </div>
  );
}

/**
 * Карточка задачи (универсальный слайдер-слой): шапка — доменная цепочка
 * происхождения (Письмо → Резолюция → Поручение → Задача) и кнопка выдвижной
 * панели «О задаче»; слева — название, доска атрибутов сеткой, описание,
 * подзадачи в один клик и чек-лист; справа — постоянная колонка обсуждения;
 * свойства/участники/файлы — дополнительная выдвижная панель поверх.
 */
export function TaskCard({ taskId }: { taskId: string }) {
  const { data: task, isLoading } = useTaskDetail(taskId);
  const addSubtask = useAddSubtask(taskId);
  const navigate = useNavigate();
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const [aboutOpen, setAboutOpen] = useState(false);
  const { chatW, onDividerDown } = useCardChatWidth();

  function onAddSubtask(event: FormEvent) {
    event.preventDefault();
    const title = subtaskTitle.trim();
    if (!title || addSubtask.isPending) return;
    setSubtaskTitle('');
    addSubtask.mutate(title);
  }

  if (isLoading || !task) {
    return (
      <div className="grid h-full grid-cols-[minmax(0,1fr)_480px]">
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
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <DomainChain nodes={chainNodes} />
        </div>
        <button
          type="button"
          onClick={() => setAboutOpen((v) => !v)}
          aria-label={ui.tasks.aboutTask}
          title={ui.tasks.aboutTask}
          className={cn(
            'shrink-0 rounded-lg p-2 transition-colors hover:bg-accent',
            aboutOpen ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          <PanelRight className="size-4" strokeWidth={1.75} />
        </button>
      </div>

      <div
        className="relative grid min-h-0 flex-1"
        style={{ gridTemplateColumns: `minmax(0,1fr) 6px ${chatW}px` }}
      >
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

          <div className="mt-3">
            <TaskStageStepper taskId={taskId} currentStageId={task.stage.id} />
          </div>

          <p className="mt-4 text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
            {task.description}
          </p>

          <div className="mt-5 flex flex-wrap gap-6">
            <div className="max-w-[420px] min-w-[280px] flex-1 divide-y divide-border/60 rounded-lg border border-border/60">
              <Row label={ui.tasks.fieldPriority}>
                <NodeChip tone={priorityTone[task.priority]}>
                  {ui.tasks.priority[task.priority]}
                </NodeChip>
              </Row>
              <Row label={ui.tasks.deadline}>
                <DeadlineChip deadline={task.deadline} />
              </Row>
              <Row label={ui.tasks.assignee}>
                {task.assignee ? (
                  <>
                    <PersonAvatar name={task.assignee.displayName} className="size-6" />
                    <span className="truncate">{task.assignee.displayName}</span>
                  </>
                ) : (
                  ui.common.notSet
                )}
              </Row>
              <Row label={ui.tasks.creator}>
                <PersonAvatar name={task.creator.displayName} className="size-6" />
                <span className="truncate">{task.creator.displayName}</span>
              </Row>
            </div>

            <div className="max-w-[420px] min-w-[280px] flex-1 divide-y divide-border/60 rounded-lg border border-border/60">
              <Row label={ui.tasks.participants}>
                {task.participants.length > 0 ? (
                  <>
                    <span className="flex shrink-0 -space-x-1.5">
                      {task.participants.slice(0, 3).map((p) => (
                        <PersonAvatar
                          key={p.id}
                          name={p.displayName}
                          className="size-6 ring-2 ring-card"
                        />
                      ))}
                    </span>
                    <span className="truncate">
                      {task.participants.map((p) => p.displayName).join(', ')}
                    </span>
                  </>
                ) : (
                  ui.common.notSet
                )}
              </Row>
              <Row label={ui.tasks.project}>
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
              </Row>
              <Row label={ui.tasks.spent}>
                <span className="font-mono text-[12px] tabular-nums">
                  {formatMinutes(task.spentMinutes)}
                </span>
              </Row>
              <Row label={ui.tasks.created}>
                <span className="font-mono text-[12px] tabular-nums">
                  {formatDateTime(task.createdAt)}
                </span>
              </Row>
            </div>
          </div>

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

        <div
          onPointerDown={onDividerDown}
          role="separator"
          aria-orientation="vertical"
          className="group relative cursor-col-resize"
        >
          <span className="absolute inset-y-0 left-1/2 w-px bg-border transition-colors group-hover:bg-port/60" />
        </div>

        <div className="min-h-0 bg-background">
          <TaskDiscussion taskId={taskId} />
        </div>

        {aboutOpen ? <TaskAboutDrawer task={task} onClose={() => setAboutOpen(false)} /> : null}
      </div>
    </div>
  );
}
