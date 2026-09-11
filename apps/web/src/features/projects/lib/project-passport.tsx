import { Activity, CalendarClock, Hash, Lock, User, UserCog, Users } from 'lucide-react';
import type { ProjectListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { NodeChip } from '@nodus/ui/components/node-chip';

import type { CardRef } from '../../../app/shell/card-stack.js';
import { formatDate, formatDateTime } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import type { EntityFieldDef } from '../../../shared/ui/entity-fields.js';

const monoValue = 'font-mono text-[12px] tabular-nums';

/** Паспорт проекта — поля-реестром, не Badge-простыня (плейбук §3.4):
 *  defs для общего каркаса EntityFields (код, моя роль, приватность,
 *  руководитель, сроки, участники, активность; стадия проекта удалена —
 *  вердикт владельца 2026-09-11, справочник переоценим на бэкенде). Живут
 *  во вкладке «О проекте» левой зоны карточки. Руководитель — переход в
 *  карточку сотрудника стеком (openCard, ADR-0009). */
export function projectPassportDefs(
  project: ProjectListItem,
  openCard: (ref: CardRef) => void,
): EntityFieldDef[] {
  return [
    {
      key: 'code',
      icon: <Hash className="size-3.5" />,
      label: ui.projects.fieldCode,
      render: () => <span className={monoValue}>{project.code}</span>,
    },
    {
      key: 'myRole',
      icon: <UserCog className="size-3.5" />,
      label: ui.projects.myRoleLabel,
      render: () => (
        <NodeChip tone={project.myRole === 'manager' ? 'success' : 'muted'}>
          {ui.projects.myRole[project.myRole]}
        </NodeChip>
      ),
    },
    {
      key: 'privacy',
      icon: <Lock className="size-3.5" />,
      label: ui.projects.privacyLabel,
      render: () => <NodeChip tone="muted">{ui.projects.privacy[project.privacy]}</NodeChip>,
    },
    {
      key: 'manager',
      icon: <User className="size-3.5" />,
      label: ui.projects.manager,
      render: () =>
        project.manager ? (
          <button
            type="button"
            onClick={() => openCard({ kind: 'employee', id: project.manager?.id ?? '' })}
            className="flex min-w-0 items-center gap-2 hover:underline"
          >
            <PersonAvatar name={project.manager.displayName} className="size-6 shrink-0" />
            <span className="truncate">{project.manager.displayName}</span>
          </button>
        ) : (
          ui.common.notSet
        ),
    },
    {
      key: 'endDate',
      icon: <CalendarClock className="size-3.5" />,
      label: ui.projects.endDate,
      render: () =>
        project.endDate ? (
          <span className={monoValue}>{formatDate(project.endDate)}</span>
        ) : (
          ui.common.notSet
        ),
    },
    {
      key: 'members',
      icon: <Users className="size-3.5" />,
      label: ui.projects.members,
      render: () => (
        <>
          <span className="flex shrink-0 -space-x-1.5">
            {project.membersPreview.slice(0, 3).map((member) => (
              <PersonAvatar
                key={member.id}
                name={member.displayName}
                className="size-6 ring-2 ring-card"
              />
            ))}
          </span>
          <span>
            {project.membersPreview.map((m) => m.displayName).join(', ')}
            {project.membersCount > project.membersPreview.length
              ? ` +${project.membersCount - project.membersPreview.length}`
              : ''}
          </span>
        </>
      ),
    },
    {
      key: 'activity',
      icon: <Activity className="size-3.5" />,
      label: ui.projects.activity,
      render: () => <span className={monoValue}>{formatDateTime(project.activityAt)}</span>,
    },
  ];
}
