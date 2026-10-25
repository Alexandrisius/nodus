import { CalendarClock, ChevronDown, Flag, Milestone, User } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { TaskBulkAction, TaskListItem } from '@nodus/contracts';
import { taskPrioritySchema, ui } from '@nodus/contracts';
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
import { BulkIsland, bulkActionClass as action } from '../../../shared/views/bulk-island.js';
import { stageTone } from '../../../shared/ui/board/stage-tone.js';
import { DateTimePicker } from '../../../shared/ui/date-time-picker.js';
import { PeoplePicker } from '../../../shared/ui/people-picker.js';
import { priorityTone } from '../../../shared/views/task-table-fields.js';
import { useBulkTasks } from '../api/task-edit-api.js';

const BULK_LIMIT = 100;

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
 * Островок массовых действий журнала задач (#311): каркас — общий
 * `shared/views/bulk-island` (одна механика во всех модулях), здесь —
 * только действия задачи: стадия, ответственный, срок, приоритет. Каждая
 * задача проверяется сервером отдельно (права, гейты маршрута): отчёт
 * «изменено n из m» + сколько пропущено.
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
  const typeIds = new Set(selectedTasks.map((t) => t.type.id));
  const singleType = typeIds.size <= 1;
  // Статусы маршрута выбранного типа: у разных типов свои «В работе».
  const { data: stages } = useTaskStages(singleType ? [...typeIds][0] : undefined);
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
    <BulkIsland
      visible={visible}
      count={shownCount}
      ariaLabel={ui.tasks.title}
      pending={bulk.isPending}
      onClear={onClear}
    >
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
    </BulkIsland>
  );
}
