import { Mail, MessageSquare, PanelRight, Plus, Waypoints } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { TaskChainNode } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Checkbox } from '@nodus/ui/components/checkbox';
import { Input } from '@nodus/ui/components/input';
import { NodeChip } from '@nodus/ui/components/node-chip';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { Separator } from '@nodus/ui/components/separator';
import { cn } from '@nodus/ui/lib/utils';

import { DomainChain, type ChainNode } from '../../../shared/ui/domain-chain.js';
import { useAddSubtask, useTaskDetail } from '../api/tasks-api.js';
import { useCardChatWidth } from '../lib/use-card-chat-width.js';
import { TaskAboutDrawer } from './task-about-drawer.js';
import { TaskBranchDrawer } from './task-branch-drawer.js';
import { TaskCardSkeleton } from './task-card-skeleton.js';
import { TaskDiscussion } from './task-discussion.js';
import { TaskFields } from './task-fields.js';
import { TaskActionBar } from './task-stage-controls.js';
import { TaskStatusBadge } from './task-status-badge.js';

const chainCaption: Record<TaskChainNode['kind'], string> = {
  letter: ui.letters.letter,
  resolution: ui.letters.resolution,
  instruction: ui.tasks.instruction,
  task: ui.tasks.task,
  chat_message: ui.tasks.chatNode,
};

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
  // Панель «О задаче» монтируется раз и остаётся: колонка анимируется
  // 0↔360px (плавный пуш), состояние (избранное, скролл) не теряется.
  const [aboutMounted, setAboutMounted] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  // Навигатор ветки монтируется раз и остаётся: колонка сетки анимируется
  // 0↔300px (плавный пуш контента), состояние панели не теряется.
  const [branchMounted, setBranchMounted] = useState(false);
  const { chatW, onDividerDown, dragging } = useCardChatWidth();

  function onAddSubtask(event: FormEvent) {
    event.preventDefault();
    const title = subtaskTitle.trim();
    if (!title || addSubtask.isPending) return;
    setSubtaskTitle('');
    addSubtask.mutate(title);
  }

  if (isLoading || !task) {
    return <TaskCardSkeleton chatW={chatW} />;
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
      {/* Полоса цепочки: бордюр — структура (с первого кадра роста), контент — fade */}
      <div className="shrink-0 border-b border-border">
        <div className="content-fade flex items-center gap-3 px-5 py-3">
          <button
            type="button"
            onClick={() => {
              setBranchMounted(true);
              setBranchOpen((v) => !v);
            }}
            aria-label={ui.tasks.branch}
            title={ui.tasks.branch}
            className={cn(
              'shrink-0 rounded-lg p-2 transition-colors hover:bg-accent',
              branchOpen ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            <Waypoints className="size-4" strokeWidth={1.75} />
          </button>
          <div className="min-w-0 flex-1 overflow-x-auto">
            <DomainChain nodes={chainNodes} />
          </div>
          <button
            type="button"
            onClick={() => {
              setAboutMounted(true);
              setAboutOpen((v) => !v);
            }}
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
      </div>

      {/* Треки БЕЗ transition: chatW меняется на каждый pointermove drag'а,
          анимация трека = вечная догоняющая анимация и фризы (подтверждено:
          react-resizable-panels — transitions только для программного
          toggle, никогда при ручном ресайзе). Плавный пуш навигатора ветки
          изолирован transition-[width] на самой колонке — drag чата его
          не затрагивает. */}
      <div
        className="relative grid min-h-0 flex-1"
        style={{ gridTemplateColumns: `auto minmax(0,1fr) 6px auto auto` }}
      >
        <div
          className={cn(
            'min-h-0 overflow-hidden transition-[width] duration-200 ease-out',
            branchOpen ? 'w-[300px]' : 'w-0',
          )}
        >
          {branchMounted ? (
            <TaskBranchDrawer taskId={taskId} onClose={() => setBranchOpen(false)} />
          ) : null}
        </div>
        {/* Левая зона: скроллится только контент; нижний бар действий
            замоноличен (не двигается скроллом — модель Битрикса).
            @container — сетка полей перестраивается от ширины зоны (ресайз чата) */}
        <div className="flex min-h-0 flex-col @container">
          <div className="content-fade min-h-0 flex-1 overflow-y-auto p-6">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="min-w-0 flex-1 text-xl leading-snug font-semibold">{task.title}</h2>
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

            <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
              {task.description}
            </p>

            <TaskFields task={task} />

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

          {/* Замоноличенный нижний бар: главные кнопки движения/завершения
              всегда под рукой, не уезжают со скроллом (модель Битрикса) */}
          <div className="shrink-0 border-t border-border px-5 py-3">
            <TaskActionBar task={task} />
          </div>
        </div>

        <div
          onPointerDown={onDividerDown}
          role="separator"
          aria-orientation="vertical"
          className="group relative cursor-col-resize"
        >
          <span className="absolute inset-y-0 left-1/2 w-px bg-border transition-colors group-hover:bg-port/60" />
        </div>

        {/* Зона чата: тёмный фон — структура (виден с первого кадра роста,
            НЕ появляется вместе с контентом — иначе читается как смена цвета
            в середине раскрытия); fade — только содержимое обсуждения.
            При открытой «О задаче» СУЖАЕТСЯ на ширину панели (та же
            duration/easing — синхронно с её ростом, сумма постоянна):
            левая панель и разделитель НЕ двигаются (вердикт владельца). */}
        <div
          className={cn(
            'min-h-0 overflow-hidden',
            // transition — ТОЛЬКО для программного toggle «О задаче»;
            // во время ручного drag — снят, иначе догоняющая анимация (gotchas)
            !dragging && 'transition-[width] duration-200 ease-out',
          )}
          style={{ width: aboutOpen ? Math.max(chatW - 360, 280) : chatW }}
        >
          <div className="h-full w-full bg-background">
            <div className="content-fade h-full">
              <TaskDiscussion taskId={taskId} />
            </div>
          </div>
        </div>

        {/* Панель «О задаче» — вталкивающая колонка справа (не оверлей:
            чат и кнопка отправки остаются доступны — вердикт владельца) */}
        <div
          className={cn(
            'min-h-0 overflow-hidden transition-[width] duration-200 ease-out',
            aboutOpen ? 'w-[360px]' : 'w-0',
          )}
        >
          {aboutMounted ? (
            <TaskAboutDrawer task={task} onClose={() => setAboutOpen(false)} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
