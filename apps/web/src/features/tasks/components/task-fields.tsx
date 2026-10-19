import {
  CalendarClock,
  CalendarPlus,
  Eye,
  Flag,
  FolderKanban,
  Hourglass,
  Milestone,
  Shapes,
  Timer,
  User,
  UserPen,
  Users,
} from 'lucide-react';
import { memo } from 'react';
import type { TaskDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { projectsAvailable } from '../../../shared/api/projects-available.js';
import { formatDateTime } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { EntityFields, type EntityFieldDef } from '../../../shared/ui/entity-fields.js';
import { identityTone } from '../../../shared/ui/identity-tone.js';
import { TaskDeadlineField, TaskPlannedField, TaskPriorityField } from './task-field-editors.js';
import { TaskAssigneeField, TaskPeopleField } from './task-people-field.js';
import { TaskStageField } from './task-stage-controls.js';
import { TaskSpentField } from './task-time.js';

const VISIBILITY_KEY = 'nodus-task-fields-v1';

/** Инспектор полей карточки задачи: реестр дескрипторов на общем каркасе
 *  EntityFields (shared/ui/entity-fields.tsx — каркас общий с письмом,
 *  проектом и сотрудником; здесь только доменные defs).
 *  Порядок: в 2-колоночной раскладке «Стадия» оказывается строго под
 *  «Проектом», «Наблюдатели» — под «Соисполнителями» (вердикт владельца).
 *  Личная колонка «Моего плана» здесь НЕ показывается — она меняется
 *  только DnD на доске (модель Битрикса). */
export const TaskFields = memo(function TaskFields({ task }: { task: TaskDetail }) {
  const openCard = useOpenCard();

  const project: EntityFieldDef = {
    key: 'project',
    icon: <FolderKanban className="size-3.5" />,
    label: ui.tasks.project,
    render: () =>
      task.project ? (
        <button
          type="button"
          title={task.project.name}
          className="flex min-w-0 items-center gap-1.5 text-sm text-info hover:underline"
          onClick={() => openCard({ kind: 'project', id: task.project?.id ?? '' })}
        >
          <span
            aria-hidden
            className={`size-1.5 shrink-0 rounded-full ${identityTone[task.project.color].dot}`}
          />
          <span className="truncate">{task.project.name}</span>
        </button>
      ) : (
        ui.common.notSet
      ),
  };
  // Тип задачи (ADR-0020): ступень 1 — один системный «Задача»; смена типа
  // = смена маршрута — придёт со ступенью 2 вместе с редактором схем.
  const type: EntityFieldDef = {
    key: 'type',
    icon: <Shapes className="size-3.5" />,
    label: ui.tasks.type,
    render: () => <span>{task.type.name}</span>,
  };
  const created: EntityFieldDef = {
    key: 'created',
    icon: <CalendarPlus className="size-3.5" />,
    label: ui.tasks.created,
    render: () => (
      <span className="font-mono text-label-sm tabular-nums">{formatDateTime(task.createdAt)}</span>
    ),
  };
  // Проекты (#52) ещё без бэкенда: в живом режиме поле скрыто, его слот в
  // сетке занимает «Тип» — «Стадия» по-прежнему под третьим рядом.
  const withProject = projectsAvailable() || task.project !== null;

  const defs: EntityFieldDef[] = [
    {
      key: 'priority',
      icon: <Flag className="size-3.5" />,
      label: ui.tasks.fieldPriority,
      render: () => <TaskPriorityField task={task} />,
    },
    {
      key: 'deadline',
      icon: <CalendarClock className="size-3.5" />,
      label: ui.tasks.deadline,
      render: () => <TaskDeadlineField task={task} />,
    },
    {
      key: 'assignee',
      icon: <User className="size-3.5" />,
      label: ui.tasks.assignee,
      render: () => <TaskAssigneeField task={task} />,
    },
    {
      key: 'creator',
      icon: <UserPen className="size-3.5" />,
      label: ui.tasks.creator,
      render: () => (
        <>
          <PersonAvatar
            name={task.creator.displayName}
            avatarUrl={task.creator.avatarUrl}
            className="size-6"
          />
          <span>{task.creator.displayName}</span>
        </>
      ),
    },
    withProject ? project : type,
    {
      key: 'participants',
      icon: <Users className="size-3.5" />,
      label: ui.tasks.participants,
      render: () => <TaskPeopleField task={task} role="coexecutor" />,
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
      render: () => <TaskPeopleField task={task} role="observer" />,
    },
    {
      key: 'spent',
      icon: <Timer className="size-3.5" />,
      label: ui.tasks.spent,
      render: () => <TaskSpentField task={task} />,
    },
    {
      key: 'planned',
      icon: <Hourglass className="size-3.5" />,
      label: ui.tasks.plannedTime,
      render: () => <TaskPlannedField task={task} />,
    },
    ...(withProject ? [type, created] : [created]),
  ];

  return <EntityFields defs={defs} storageKey={VISIBILITY_KEY} />;
});
