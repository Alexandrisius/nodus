import { CornerDownRight, Mail, MessageSquare } from 'lucide-react';
import type { TaskListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { formatMinutes } from '../../lib/format.js';
import { PersonAvatar } from '../person-avatar.js';
import { DeadlineChip } from '../deadline-chip.js';

/** Карточка задачи канбан-доски (общая оболочка борда, второй потребитель —
 *  проектная доска): node-панель; отображаемые поля настраиваются шестерёнкой
 *  вида — карточка получает предикат видимости из реестра потребителя.
 *  Презентационная: открытие (клик, rect источника для shared-element) и
 *  префетч подключает фича через onOpen/onHover.
 *  overlay — призрак DragOverlay во время переноса (активный узел: свечение).
 *  placeholder — слот переносимой карточки (пунктир, без свечения). */
export function BoardTaskCard({
  task,
  parentNumber,
  isVisible,
  overlay = false,
  placeholder = false,
  onOpen,
  onHover,
}: {
  task: TaskListItem;
  parentNumber?: number;
  isVisible: (fieldId: string) => boolean;
  overlay?: boolean;
  placeholder?: boolean;
  /** Клик по карточке: фича решает, куда открыть (слайдер) и прокидывает rect. */
  onOpen: (task: TaskListItem, rect: DOMRect) => void;
  /** Ховер: префетч детали/обсуждения (опционально). */
  onHover?: (task: TaskListItem) => void;
}) {
  const showFooter = isVisible('assignee') || isVisible('comments') || isVisible('spent');

  return (
    <button
      type="button"
      onPointerEnter={() => onHover?.(task)}
      onClick={(e) => onOpen(task, e.currentTarget.getBoundingClientRect())}
      className={cn(
        'node-panel flex w-full flex-col gap-2 p-3 text-left transition-colors hover:border-input',
        overlay && 'cursor-grabbing border-input shadow-[0_0_12px_var(--glow)] hover:border-input',
        placeholder && 'border-dashed opacity-60 hover:border-input',
      )}
    >
      {isVisible('parent') && parentNumber !== undefined ? (
        <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
          <CornerDownRight className="size-3" />
          {ui.tasks.subtaskOf} · {parentNumber}
        </span>
      ) : null}
      {isVisible('number') || isVisible('source') ? (
        <span className="flex items-center justify-between gap-2">
          {isVisible('number') ? (
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              № {task.number}
            </span>
          ) : (
            <span />
          )}
          {isVisible('source') && task.source === 'letter' ? (
            <Mail className="size-3.5 text-info/70" aria-label={ui.tasks.fromLetter} />
          ) : null}
          {isVisible('source') && task.source === 'chat_message' ? (
            <MessageSquare className="size-3.5 text-info/70" aria-label={ui.tasks.fromChat} />
          ) : null}
        </span>
      ) : null}
      <span className="line-clamp-2 text-sm font-medium">{task.title}</span>
      {isVisible('deadline') ? <DeadlineChip deadline={task.deadline} /> : null}
      {isVisible('project') && task.project ? (
        <span className="truncate font-mono text-[11px] text-info/80">{task.project.name}</span>
      ) : null}
      {showFooter ? (
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {isVisible('assignee') && task.assignee ? (
            <PersonAvatar name={task.assignee.displayName} className="size-6" />
          ) : null}
          {isVisible('comments') ? (
            <span className="ml-auto inline-flex items-center gap-1 font-mono text-[11px] tabular-nums">
              <MessageSquare className="size-3.5" />
              {task.commentsCount}
            </span>
          ) : (
            <span className="ml-auto" />
          )}
          {isVisible('spent') && task.spentMinutes > 0 ? (
            <span className="font-mono text-[11px] tabular-nums">
              {formatMinutes(task.spentMinutes)}
            </span>
          ) : null}
        </span>
      ) : null}
    </button>
  );
}
