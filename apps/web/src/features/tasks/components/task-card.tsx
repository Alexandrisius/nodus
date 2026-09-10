import { Mail, MessageSquare, PanelRight, Plus, Waypoints } from 'lucide-react';
import { useCallback, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { TaskChainNode } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Checkbox } from '@nodus/ui/components/checkbox';
import { Input } from '@nodus/ui/components/input';
import { NodeChip } from '@nodus/ui/components/node-chip';
import { NodeLabel } from '@nodus/ui/components/node-label';
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

/** Ширина панели «О задаче» — на неё же суется чат (сумма постоянна). */
const ABOUT_W = 360;

/**
 * Карточка задачи (универсальный слайдер-слой): шапка — доменная цепочка
 * происхождения (Письмо → Резолюция → Поручение → Задача; само-узел — только
 * «ТИП · №», БЕЗ повтора названия — оно один раз в главном заголовке) и
 * кнопки панелей «Ветка»/«О задаче»; слева — название, описание, доска полей,
 * подзадачи и чек-лист + замоноличенный нижний бар действий; справа —
 * постоянная колонка обсуждения; «О задаче» — вталкивающая колонка справа.
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
  const chatRef = useRef<HTMLDivElement>(null);
  const { chatW, onDividerDown, dragging } = useCardChatWidth(chatRef, aboutOpen ? ABOUT_W : 0);
  // Стабильные колбэки: дочерние панели мемоизированы, инлайн-стрелки
  // ломали бы memo на каждом рендере.
  const closeBranch = useCallback(() => setBranchOpen(false), []);
  const closeAbout = useCallback(() => setAboutOpen(false), []);

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
    // Само-узел (последний) — без повтора названия: оно один раз в заголовке.
    label: i === task.chain.length - 1 ? undefined : node.label,
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
          {task.source === 'letter' ? (
            <NodeChip tone="info" className="shrink-0">
              <Mail className="size-3" />
              {ui.tasks.instruction}
            </NodeChip>
          ) : task.source === 'chat_message' ? (
            <NodeChip tone="info" className="shrink-0">
              <MessageSquare className="size-3" />
              {ui.tasks.fromChat}
            </NodeChip>
          ) : null}
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

      {/* Треки БЕЗ transition и БЕЗ setState на кадр: во время drag ширина
          чата выставляется императивно (el.style.width в rAF), React не
          рендерит карточку (gotchas: transition при ручном ресайзе = фризы).
          Пуш панелей изолирован transition-[width] на их колонках. */}
      <div
        className="relative grid min-h-0 flex-1"
        style={{ gridTemplateColumns: `auto minmax(0,1fr) auto auto` }}
      >
        <div
          className={cn(
            'min-h-0 overflow-hidden transition-[width] duration-200 ease-out',
            branchOpen ? 'w-[300px]' : 'w-0',
          )}
        >
          {branchMounted ? <TaskBranchDrawer taskId={taskId} onClose={closeBranch} /> : null}
        </div>
        {/* Левая зона: скроллится только контент; нижний бар действий
            замоноличен (не двигается скроллом — модель Битрикса).
            border-r — СТРУКТУРНАЯ вертикальная граница с чатом: горизонтальные
            линии бара действий и композера упираются ровно в неё (вердикт
            владельца о несходящихся линиях). Ручка ресайза — оверлей поверх
            границы (внутри этой зоны, не съедает трек).
            @container — сетка полей перестраивается от ширины зоны (ресайз чата) */}
        <div className="relative flex min-h-0 flex-col border-r border-border @container">
          <div className="content-fade min-h-0 flex-1 overflow-y-auto p-6">
            {/* Название — в хроме слайдера (вердикт владельца), в теле
                не дублируется: тело начинается с описания */}
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
              {task.description}
            </p>

            <TaskFields task={task} />

            {/* Секции разделяются отступами, без висячих линий-сепараторов
                (вердикт владельца: линия не доходила до границы зоны) */}
            <div className="mt-6">
              <NodeLabel label={ui.tasks.subtasks} count={task.subtasks.length} />
            </div>
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
              <div className="mt-6">
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
              </div>
            ) : null}
          </div>

          {/* Замоноличенный нижний бар: главные кнопки движения/завершения
              всегда под рукой, не уезжают со скроллом (модель Битрикса).
              Высота h-16 = высоте композера чата: их верхние линии образуют
              ОДНУ горизонталь через границу зон (вердикт владельца) */}
          <div className="flex h-16 shrink-0 items-center border-t border-border px-5">
            <TaskActionBar task={task} />
          </div>

          {/* Ручка ресайза чата: невидимый оверлей ПОВЕРХ структурной
              границы (border-r зоны) — hit-area 12px центрирована на линии,
              трека в сетке нет, линии зон сходятся в одну вертикаль */}
          <div
            onPointerDown={onDividerDown}
            role="separator"
            aria-orientation="vertical"
            aria-label={ui.tasks.resizeChat}
            title={ui.tasks.resizeChat}
            className="group absolute top-0 right-0 z-10 h-full w-3 translate-x-1/2 cursor-col-resize"
          >
            <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-port/60 opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        </div>

        {/* Зона чата: тёмный фон — структура (виден с первого кадра роста,
            НЕ появляется вместе с контентом — иначе читается как смена цвета
            в середине раскрытия); fade — только содержимое обсуждения.
            При открытой «О задаче» СУЖАЕТСЯ на ширину панели (та же
            duration/easing — синхронно с её ростом, сумма постоянна):
            левая панель и разделитель НЕ двигаются (вердикт владельца). */}
        <div
          ref={chatRef}
          className={cn(
            'min-h-0 overflow-hidden',
            // transition — ТОЛЬКО для программного toggle «О задаче»;
            // во время ручного drag — снят, ширина идёт императивно (gotchas)
            !dragging && 'transition-[width] duration-200 ease-out',
          )}
          style={{ width: Math.max(chatW - (aboutOpen ? ABOUT_W : 0), 280) }}
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
          {aboutMounted ? <TaskAboutDrawer task={task} onClose={closeAbout} /> : null}
        </div>
      </div>
    </div>
  );
}
