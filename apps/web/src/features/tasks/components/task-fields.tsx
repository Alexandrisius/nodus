import {
  CalendarClock,
  CalendarPlus,
  Eye,
  Flag,
  FolderKanban,
  Milestone,
  Plus,
  Timer,
  User,
  UserPen,
  Users,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { TaskDetail, UserRef } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { NodeChip } from '@nodus/ui/components/node-chip';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@nodus/ui/components/dropdown-menu';

import { formatDateTime, formatMinutes } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { DeadlineChip } from '../../../shared/ui/deadline-chip.js';
import { priorityTone } from '../lib/task-fields.js';
import { TaskStageField } from './task-stage-controls.js';

const VISIBILITY_KEY = 'nodus-task-fields-v1';

type FieldDef = {
  key: string;
  icon: ReactNode;
  label: string;
  render: () => ReactNode;
};

function readHidden(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(VISIBILITY_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

function PeopleList({ people }: { people: UserRef[] }) {
  if (people.length === 0) return <>{ui.common.notSet}</>;
  return (
    <>
      <span className="flex shrink-0 -space-x-1.5">
        {people.slice(0, 3).map((p) => (
          <PersonAvatar key={p.id} name={p.displayName} className="size-6 ring-2 ring-card" />
        ))}
      </span>
      <span className="truncate">{people.map((p) => p.displayName).join(', ')}</span>
    </>
  );
}

/** Инспектор полей карточки (референс ClickUp, грамматика «Инструмента»):
 *  чистые строки «иконка + метка / значение» без табличных рамок.
 *  ПОЛЯ — РЕЕСТР дескрипторов, а не разметка: любое количество полей,
 *  видимость настраивается кнопкой «+ Поле» (persist localStorage);
 *  кастомные поля после MVP — те же дескрипторы, каталог из справочника
 *  (точка расширения I13/I15, не выдумываем заново на проде).
 *  Порядок: в 2-колоночной раскладке «Стадия» оказывается строго под
 *  «Проектом», «Наблюдатели» — под «Соисполнителями» (вердикт владельца).
 *  Личная колонка «Моего плана» здесь НЕ показывается — она меняется
 *  только DnD на доске (модель Битрикса).
 *  Сетка на container queries: узкая панель — 1 колонка, широкая — 2;
 *  зазор фиксирован, дальше растут боковые отступы (mx-auto). */
export function TaskFields({ task }: { task: TaskDetail }) {
  const navigate = useNavigate();
  const [hiddenKeys, setHiddenKeys] = useState<string[]>(readHidden);

  function toggle(key: string) {
    setHiddenKeys((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      localStorage.setItem(VISIBILITY_KEY, JSON.stringify(next));
      return next;
    });
  }

  const defs: FieldDef[] = [
    {
      key: 'priority',
      icon: <Flag className="size-3.5" />,
      label: ui.tasks.fieldPriority,
      render: () => (
        <NodeChip tone={priorityTone[task.priority]}>{ui.tasks.priority[task.priority]}</NodeChip>
      ),
    },
    {
      key: 'deadline',
      icon: <CalendarClock className="size-3.5" />,
      label: ui.tasks.deadline,
      render: () => <DeadlineChip deadline={task.deadline} />,
    },
    {
      key: 'assignee',
      icon: <User className="size-3.5" />,
      label: ui.tasks.assignee,
      render: () =>
        task.assignee ? (
          <>
            <PersonAvatar name={task.assignee.displayName} className="size-6" />
            <span className="truncate">{task.assignee.displayName}</span>
          </>
        ) : (
          ui.common.notSet
        ),
    },
    {
      key: 'creator',
      icon: <UserPen className="size-3.5" />,
      label: ui.tasks.creator,
      render: () => (
        <>
          <PersonAvatar name={task.creator.displayName} className="size-6" />
          <span className="truncate">{task.creator.displayName}</span>
        </>
      ),
    },
    {
      key: 'project',
      icon: <FolderKanban className="size-3.5" />,
      label: ui.tasks.project,
      render: () =>
        task.project ? (
          <button
            type="button"
            className="truncate font-mono text-[12px] text-info hover:underline"
            onClick={() =>
              void navigate({
                to: '/tasks/$taskId/project/$projectId',
                params: { taskId: task.id, projectId: task.project?.id ?? '' },
              })
            }
          >
            {task.project.name}
          </button>
        ) : (
          ui.common.notSet
        ),
    },
    {
      key: 'participants',
      icon: <Users className="size-3.5" />,
      label: ui.tasks.participants,
      render: () => <PeopleList people={task.participants} />,
    },
    {
      key: 'stage',
      icon: <Milestone className="size-3.5" />,
      label: ui.tasks.fieldStage,
      render: () => <TaskStageField task={task} />,
    },
    {
      key: 'observers',
      icon: <Eye className="size-3.5" />,
      label: ui.tasks.watchers,
      render: () => <PeopleList people={task.observers} />,
    },
    {
      key: 'spent',
      icon: <Timer className="size-3.5" />,
      label: ui.tasks.spent,
      render: () => (
        <span className="font-mono text-[12px] tabular-nums">
          {formatMinutes(task.spentMinutes)}
        </span>
      ),
    },
    {
      key: 'created',
      icon: <CalendarPlus className="size-3.5" />,
      label: ui.tasks.created,
      render: () => (
        <span className="font-mono text-[12px] tabular-nums">{formatDateTime(task.createdAt)}</span>
      ),
    },
  ];

  const visible = defs.filter((d) => !hiddenKeys.includes(d.key));

  return (
    <div className="mx-auto mt-5 grid max-w-3xl grid-cols-1 gap-x-12 gap-y-0.5 @min-[880px]:grid-cols-2">
      {visible.map((def) => (
        <Field key={def.key} icon={def.icon} label={def.label}>
          {def.render()}
        </Field>
      ))}
      {/* Настройка видимости полей; каталог кастомных полей — после MVP */}
      <DropdownMenu>
        <DropdownMenuTrigger className="-mx-2 flex items-center gap-2 rounded-md px-2 py-2 text-left font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase transition-colors hover:bg-accent/40 hover:text-foreground @min-[880px]:col-span-2">
          <Plus className="size-3.5" strokeWidth={1.75} />
          {ui.tasks.addField}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {defs.map((def) => (
            <DropdownMenuCheckboxItem
              key={def.key}
              checked={!hiddenKeys.includes(def.key)}
              onCheckedChange={() => toggle(def.key)}
              onSelect={(e) => e.preventDefault()}
            >
              {def.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function Field({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="-mx-2 flex flex-wrap items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent/40">
      <span className="flex w-44 shrink-0 items-center gap-2 font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
        <span aria-hidden className="shrink-0 opacity-70">
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </span>
      {/* min-w: на предельно узкой зоне значение переносится под метку,
          а не сжимается в ноль */}
      <span className="flex min-w-[160px] flex-1 items-center gap-2 text-sm">{children}</span>
    </div>
  );
}
