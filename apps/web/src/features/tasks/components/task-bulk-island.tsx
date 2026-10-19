import { CalendarClock, ChevronDown, Flag, Milestone, User, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { TaskBulkAction, TaskListItem } from '@nodus/contracts';
import { taskPrioritySchema, ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@nodus/ui/components/dropdown-menu';
import { NodeChip } from '@nodus/ui/components/node-chip';
import { cn } from '@nodus/ui/lib/utils';
import { toast } from 'sonner';

import { useTaskStages } from '../../../shared/api/task-stages.js';
import { stageTone } from '../../../shared/ui/board/stage-tone.js';
import { DateTimePicker } from '../../../shared/ui/date-time-picker.js';
import { PeoplePicker } from '../../../shared/ui/people-picker.js';
import { priorityTone } from '../../../shared/views/task-table-fields.js';
import { useBulkTasks } from '../api/task-edit-api.js';

const BULK_LIMIT = 100;

const action =
  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground';

function ActionLabel({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <>
      {icon}
      {children}
      <ChevronDown className="size-3 opacity-60" strokeWidth={1.75} />
    </>
  );
}

/**
 * Островок массовых действий журнала (#311, вердикт владельца: «как
 * островок мультиселекта сообщений в чате»): выделил строки — снизу по
 * центру всплывает узкое облако команд (счётчик, стадия, ответственный,
 * срок, приоритет, ×). Каждая задача проверяется сервером отдельно
 * (права, гейты маршрута): отчёт «изменено n из m» + сколько пропущено.
 * Обёртка смонтирована ВСЕГДА (закон выдвижных поверхностей): появление —
 * flip классов существующего элемента, плавно с первого раза.
 */
export function TaskBulkIsland({
  selectedIds,
  selectedTasks,
  onClear,
}: {
  selectedIds: readonly string[];
  /** Снапшоты выбранных строк: массовая «Стадия» — только одного типа (#378). */
  selectedTasks: readonly TaskListItem[];
  onClear: () => void;
}) {
  const bulk = useBulkTasks();
  const { data: stages } = useTaskStages();
  const singleType = new Set(selectedTasks.map((t) => t.type.id)).size <= 1;
  // Счётчик фазы выхода: островок уезжает с последним числом, а не с нулём.
  const [shownCount, setShownCount] = useState(selectedIds.length);
  if (selectedIds.length > 0 && shownCount !== selectedIds.length) {
    setShownCount(selectedIds.length);
  }
  const visible = selectedIds.length > 0;

  function run(a: TaskBulkAction) {
    // Контракт bulk — до 100 задач за раз: больше не отбрасываем молча.
    if (selectedIds.length > BULK_LIMIT) {
      toast.error(`${ui.tasks.bulkLimit} ${BULK_LIMIT}`);
      return;
    }
    bulk.mutate({ taskIds: [...selectedIds], action: a });
  }

  return (
    <div
      role="toolbar"
      aria-label={ui.tasks.title}
      aria-hidden={!visible}
      className={cn(
        'absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-2xl border border-border bg-card p-1.5 shadow-sm transition-[opacity,translate] duration-200 ease-out',
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0',
        bulk.isPending && 'pointer-events-none opacity-70',
      )}
    >
      <span className="px-2.5 font-mono text-label-sm text-foreground tabular-nums">
        {shownCount}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={action}
          tabIndex={visible ? 0 : -1}
          disabled={!singleType}
          title={!singleType ? ui.tasks.bulkSingleType : undefined}
        >
          <ActionLabel icon={<Milestone className="size-4" strokeWidth={1.75} />}>
            {ui.tasks.bulkStage}
          </ActionLabel>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top" className="w-56">
          {stages?.map((s) => (
            <DropdownMenuItem
              key={s.id}
              onSelect={() => run({ kind: 'move_to_stage', stageId: s.id })}
            >
              <span
                aria-hidden
                className={cn('size-2 shrink-0 rounded-full', stageTone[s.color].dot)}
              />
              {s.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <PeoplePicker
        selectedIds={[]}
        onToggle={(assigneeId) => run({ kind: 'set_assignee', assigneeId })}
        ariaLabel={ui.tasks.bulkAssignee}
      >
        <button type="button" className={action} tabIndex={visible ? 0 : -1}>
          <ActionLabel icon={<User className="size-4" strokeWidth={1.75} />}>
            {ui.tasks.bulkAssignee}
          </ActionLabel>
        </button>
      </PeoplePicker>
      <DateTimePicker
        value={null}
        onChange={(d) => run({ kind: 'set_deadline', deadline: d?.toISOString() ?? null })}
        ariaLabel={ui.tasks.bulkDeadline}
        clearLabel={ui.tasks.removeDeadline}
      >
        <button type="button" className={action} tabIndex={visible ? 0 : -1}>
          <ActionLabel icon={<CalendarClock className="size-4" strokeWidth={1.75} />}>
            {ui.tasks.bulkDeadline}
          </ActionLabel>
        </button>
      </DateTimePicker>
      <DropdownMenu>
        <DropdownMenuTrigger className={action} tabIndex={visible ? 0 : -1}>
          <ActionLabel icon={<Flag className="size-4" strokeWidth={1.75} />}>
            {ui.tasks.bulkPriority}
          </ActionLabel>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top" className="w-44">
          {taskPrioritySchema.options.map((p) => (
            <DropdownMenuItem key={p} onSelect={() => run({ kind: 'set_priority', priority: p })}>
              <NodeChip tone={priorityTone[p]}>{ui.tasks.priority[p]}</NodeChip>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        tabIndex={visible ? 0 : -1}
        className="ml-1 shrink-0 text-muted-foreground"
        aria-label={ui.tasks.bulkClear}
        title={ui.tasks.bulkClear}
        onClick={onClear}
      >
        <X className="size-4" strokeWidth={1.75} />
      </Button>
    </div>
  );
}
