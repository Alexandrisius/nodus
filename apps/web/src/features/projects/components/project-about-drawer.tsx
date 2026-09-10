import {
  Activity,
  CalendarClock,
  Hash,
  Lock,
  Milestone,
  User,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { memo } from 'react';
import type { ProjectListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { NodeChip } from '@nodus/ui/components/node-chip';
import { NodeLabel } from '@nodus/ui/components/node-label';

import { formatDate, formatDateTime } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { EntityFields, type EntityFieldDef } from '../../../shared/ui/entity-fields.js';

const VISIBILITY_KEY = 'nodus-project-fields-v1';

const monoValue = 'font-mono text-[12px] tabular-nums';

/** Паспорт проекта — поля-реестром, не Badge-простыня (плейбук §3.4):
 *  общий каркас EntityFields, свои defs (код, стадия проекта — ОТДЕЛЬНАЯ
 *  сущность от стадий задач, справочник I15; моя роль, приватность,
 *  руководитель, сроки, участники, активность). Живёт во вталкивающей
 *  колонке «О проекте» (пуш-механика карточки задачи). */
export const ProjectAboutDrawer = memo(function ProjectAboutDrawer({
  project,
  onClose,
}: {
  project: ProjectListItem;
  onClose: () => void;
}) {
  const defs: EntityFieldDef[] = [
    {
      key: 'code',
      icon: <Hash className="size-3.5" />,
      label: ui.projects.fieldCode,
      render: () => <span className={monoValue}>{project.code}</span>,
    },
    {
      key: 'stage',
      icon: <Milestone className="size-3.5" />,
      label: ui.projects.stage,
      render: () =>
        project.stageName ? <NodeChip tone="info">{project.stageName}</NodeChip> : ui.common.notSet,
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
          <>
            <PersonAvatar name={project.manager.displayName} className="size-6" />
            <span>{project.manager.displayName}</span>
          </>
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

  return (
    <aside className="flex h-full w-[360px] flex-col overflow-y-auto border-l border-border bg-card">
      <div className="flex shrink-0 items-center justify-between p-4 pb-0">
        <NodeLabel label={ui.projects.aboutProject} />
        <Button
          variant="ghost"
          size="icon"
          className="hover:bg-accent"
          onClick={onClose}
          aria-label={ui.common.close}
        >
          <X />
        </Button>
      </div>
      <div className="px-4 pb-4">
        <EntityFields defs={defs} storageKey={VISIBILITY_KEY} />
      </div>
    </aside>
  );
});
