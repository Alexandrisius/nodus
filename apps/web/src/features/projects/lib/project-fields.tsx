import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ProjectListItem, UserRef } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { NodeChip } from '@nodus/ui/components/node-chip';

import { formatDate, formatDateTimeShort } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import type { DataTableField } from '../../../shared/views/data-table.js';

const monoCell = 'font-mono text-[11px] text-muted-foreground tabular-nums';

function personCell(manager: UserRef | null): ReactNode {
  if (!manager) return <span className="text-xs text-muted-foreground">{ui.common.notSet}</span>;
  return (
    <>
      <PersonAvatar name={manager.displayName} className="size-6 shrink-0" />
      <span className="truncate">{manager.displayName}</span>
    </>
  );
}

/** Роль текущего пользователя — чип: руководитель — success, участник — muted. */
export function ProjectRoleChip({ project }: { project: ProjectListItem }) {
  return (
    <NodeChip tone={project.myRole === 'manager' ? 'success' : 'muted'} className="shrink-0">
      {ui.projects.myRole[project.myRole]}
    </NodeChip>
  );
}

/** Приватность — чип: закрытый проект с замком. */
export function ProjectPrivacyChip({ project }: { project: ProjectListItem }) {
  return (
    <NodeChip tone="muted" className="shrink-0">
      {project.privacy === 'closed' ? <Lock className="size-3" /> : null}
      {ui.projects.privacy[project.privacy]}
    </NodeChip>
  );
}

/**
 * Реестр колонок списка проектов (ключ вида `projects.list`): новое поле
 * модуля = +1 запись здесь (shared/views, шестерёнка + ручка ресайза).
 */
export const projectListFields: DataTableField<ProjectListItem>[] = [
  {
    id: 'code',
    label: ui.projects.fieldCode,
    defaultVisible: true,
    defaultWidth: 88,
    minWidth: 64,
    maxWidth: 140,
    render: (project) => <span className="font-mono text-[11px] tabular-nums">{project.code}</span>,
  },
  {
    id: 'name',
    label: ui.projects.fieldName,
    defaultVisible: true,
    defaultWidth: 380,
    minWidth: 160,
    maxWidth: 640,
    locked: true,
    render: (project) => <span className="truncate text-sm font-medium">{project.name}</span>,
  },
  {
    id: 'stage',
    label: ui.projects.stage,
    defaultVisible: true,
    defaultWidth: 140,
    minWidth: 100,
    render: (project) =>
      project.stageName ? (
        <NodeChip tone="info" className="shrink-0">
          {project.stageName}
        </NodeChip>
      ) : (
        <span className="text-xs text-muted-foreground">{ui.common.notSet}</span>
      ),
  },
  {
    id: 'myRole',
    label: ui.projects.myRoleLabel,
    defaultVisible: true,
    defaultWidth: 208,
    minWidth: 168,
    render: (project) => <ProjectRoleChip project={project} />,
  },
  {
    id: 'manager',
    label: ui.projects.manager,
    defaultVisible: true,
    defaultWidth: 170,
    minWidth: 110,
    render: (project) => personCell(project.manager),
  },
  {
    id: 'members',
    label: ui.projects.members,
    defaultVisible: true,
    defaultWidth: 168,
    minWidth: 120,
    render: (project) => (
      <>
        <span className="flex shrink-0 -space-x-1.5">
          {project.membersPreview.slice(0, 4).map((member) => (
            <PersonAvatar
              key={member.id}
              name={member.displayName}
              className="size-6 ring-2 ring-background"
            />
          ))}
        </span>
        <span className={monoCell}>{project.membersCount}</span>
      </>
    ),
  },
  {
    id: 'privacy',
    label: ui.projects.privacyLabel,
    defaultVisible: true,
    defaultWidth: 124,
    minWidth: 104,
    render: (project) => <ProjectPrivacyChip project={project} />,
  },
  {
    id: 'endDate',
    label: ui.projects.endDate,
    defaultVisible: false,
    defaultWidth: 132,
    minWidth: 108,
    render: (project) =>
      project.endDate ? (
        <span className={monoCell}>{formatDate(project.endDate)}</span>
      ) : (
        <span className={monoCell}>—</span>
      ),
  },
  {
    id: 'activityAt',
    label: ui.projects.activity,
    defaultVisible: true,
    defaultWidth: 152,
    minWidth: 128,
    render: (project) => (
      <span className={monoCell}>{formatDateTimeShort(project.activityAt)}</span>
    ),
  },
];
