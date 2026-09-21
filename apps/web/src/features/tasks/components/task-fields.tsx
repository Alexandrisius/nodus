import {
  CalendarClock,
  CalendarPlus,
  Eye,
  Flag,
  FolderKanban,
  Milestone,
  Timer,
  User,
  UserPen,
  Users,
} from 'lucide-react';
import { memo } from 'react';
import type { TaskDetail, UserRef } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { NodeChip } from '@nodus/ui/components/node-chip';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { formatDateTime, formatMinutes } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { DeadlineChip } from '../../../shared/ui/deadline-chip.js';
import { EntityFields, type EntityFieldDef } from '../../../shared/ui/entity-fields.js';
import { identityTone } from '../../../shared/ui/identity-tone.js';
import { priorityTone } from '../../../shared/views/task-table-fields.js';
import { TaskStageField } from './task-stage-controls.js';

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

  const defs: EntityFieldDef[] = [
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
            <span>{task.assignee.displayName}</span>
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
          <span>{task.creator.displayName}</span>
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
        <span className="font-mono text-label-sm tabular-nums">
          {formatMinutes(task.spentMinutes)}
        </span>
      ),
    },
    {
      key: 'created',
      icon: <CalendarPlus className="size-3.5" />,
      label: ui.tasks.created,
      render: () => (
        <span className="font-mono text-label-sm tabular-nums">
          {formatDateTime(task.createdAt)}
        </span>
      ),
    },
  ];

  return <EntityFields defs={defs} storageKey={VISIBILITY_KEY} />;
});

/** Люди НЕ сокращаются (вердикт владельца: места много): полное имя,
 *  не влезает — переносится. Truncate — только сверхдлинные названия
 *  типа проектов (с title-тултипом). */
function PeopleList({ people }: { people: UserRef[] }) {
  if (people.length === 0) return <>{ui.common.notSet}</>;
  return (
    <>
      <span className="flex shrink-0 -space-x-1.5">
        {people.slice(0, 3).map((p) => (
          <PersonAvatar key={p.id} name={p.displayName} className="size-6 ring-2 ring-card" />
        ))}
      </span>
      <span>{people.map((p) => p.displayName).join(', ')}</span>
    </>
  );
}
