import {
  Activity,
  Building2,
  CalendarClock,
  CalendarPlus,
  User,
  UserCog,
  UserPen,
  Users,
} from 'lucide-react';
import type { ProjectDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import type { CardRef } from '../../../app/shell/card-stack.js';
import { formatDate, formatDateTime } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import type { EntityFieldDef } from '../../../shared/ui/entity-fields.js';

const monoValue = 'font-mono text-label-sm tabular-nums';

function personLink(
  user: { id: string; displayName: string; avatarUrl: string | null },
  openCard: (ref: CardRef) => void,
) {
  return (
    <button
      type="button"
      onClick={() => openCard({ kind: 'employee', id: user.id })}
      className="flex min-w-0 items-center gap-2 hover:underline"
    >
      <PersonAvatar
        name={user.displayName}
        avatarUrl={user.avatarUrl}
        className="size-6 shrink-0"
      />
      <span className="truncate">{user.displayName}</span>
    </button>
  );
}

/**
 * Паспорт проекта — поля-реестром (не Badge-простыня): руководство,
 * заказчик, сроки, состав, создатель, активность. Идентичность (название,
 * шифр, тип, портфель, статус, видимость) живёт в шапке левой панели
 * «О проекте» и здесь не дублируется (вердикт владельца 07.11.2026).
 * Ссылки на сотрудников/контрагента открываются карточками стека (ADR-0009).
 */
export function projectPassportDefs(
  project: ProjectDetail,
  openCard: (ref: CardRef) => void,
): EntityFieldDef[] {
  return [
    {
      key: 'manager',
      icon: <User className="size-3.5" />,
      label: ui.projects.manager,
      render: () => (project.manager ? personLink(project.manager, openCard) : ui.common.notSet),
    },
    {
      key: 'assistants',
      icon: <UserCog className="size-3.5" />,
      label: ui.projects.assistants,
      render: () =>
        project.assistants.length === 0 ? (
          ui.common.notSet
        ) : (
          <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            {project.assistants.map((assistant) => (
              <span key={assistant.id}>{personLink(assistant, openCard)}</span>
            ))}
          </span>
        ),
    },
    {
      key: 'client',
      icon: <Building2 className="size-3.5" />,
      label: ui.projects.fieldClient,
      render: () =>
        project.client ? (
          <button
            type="button"
            onClick={() => openCard({ kind: 'counterparty', id: project.client?.id ?? '' })}
            className="min-w-0 truncate hover:underline"
          >
            {project.client.name}
          </button>
        ) : (
          ui.common.notSet
        ),
    },
    {
      key: 'dates',
      icon: <CalendarClock className="size-3.5" />,
      label: `${ui.projects.startDate} — ${ui.projects.endDate}`,
      render: () =>
        !project.startDate && !project.endDate ? (
          ui.common.notSet
        ) : (
          <span className={monoValue}>
            {project.startDate ? formatDate(project.startDate) : '—'} —{' '}
            {project.endDate ? formatDate(project.endDate) : '—'}
          </span>
        ),
    },
    {
      key: 'members',
      icon: <Users className="size-3.5" />,
      label: ui.projects.members,
      render: () => (
        <>
          <span className="flex shrink-0 -space-x-1.5">
            {project.membersPreview.slice(0, 4).map((member) => (
              <PersonAvatar
                key={member.id}
                name={member.displayName}
                avatarUrl={member.avatarUrl}
                className="size-6 ring-2 ring-card"
              />
            ))}
          </span>
          <span className="font-mono text-label-sm tabular-nums">{project.membersCount}</span>
        </>
      ),
    },
    {
      key: 'creator',
      icon: <UserPen className="size-3.5" />,
      label: ui.projects.creator,
      render: () => personLink(project.creator, openCard),
    },
    {
      key: 'createdAt',
      icon: <CalendarPlus className="size-3.5" />,
      label: ui.projects.created,
      render: () => <span className={monoValue}>{formatDateTime(project.createdAt)}</span>,
    },
    {
      key: 'activity',
      icon: <Activity className="size-3.5" />,
      label: ui.projects.activity,
      render: () => <span className={monoValue}>{formatDateTime(project.activityAt)}</span>,
    },
  ];
}
