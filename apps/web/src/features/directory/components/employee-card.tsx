import { MessageSquare } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { PresenceStatus } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { NodeChip } from '@nodus/ui/components/node-chip';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { Skeleton } from '@nodus/ui/components/skeleton';
import { cn } from '@nodus/ui/lib/utils';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { useAssigneeTasks, useMemberProjects } from '../../../shared/api/user-relations.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { TaskStatusBadge } from '../../../shared/ui/task-status-badge.js';
import { DeadlineChip } from '../../../shared/ui/deadline-chip.js';
import { EntityFields } from '../../../shared/ui/entity-fields.js';
import { useStartDirectConversation } from '../../../shared/chat/api.js';
import { usePresence, useUserCard, useUsersList } from '../api/directory-api.js';
import { employeeProfileDefs } from '../lib/employee-profile-fields.js';

const VISIBILITY_KEY = 'nodus-employee-fields-v1';

const presenceTone: Record<PresenceStatus, 'success' | 'warning' | 'muted'> = {
  online: 'success',
  away: 'warning',
  offline: 'muted',
};

function presenceLabel(status: PresenceStatus): string {
  if (status === 'online') return ui.common.online;
  if (status === 'away') return ui.common.away;
  return ui.common.offline;
}

type EmployeeTab = 'profile' | 'tasks' | 'projects';

/**
 * Карточка сотрудника (стек карточек, ADR-0009): полоса — аватар-якорь +
 * presence-чип и позиция (имя — в хроме слайдера, в теле не дублируется);
 * вкладки (вердикт владельца 2026-09-10, раунд 2 — от сотрудника ведётся
 * анализ портала, референс — профиль Битрикс24): **Профиль** (поля-реестр
 * полного UserCard — defs в `lib/employee-profile-fields.tsx` — + секция
 * «Подчинённые», переходы стеком), **Задачи** (ответственный — `GET
 * /tasks?assigneeId=`, открытие стеком), **Проекты** (руководит/участвует —
 * `GET /projects?memberId=`). Нижний бар h-16 — «Написать сообщение»
 * (find-or-create личного диалога).
 */
export function EmployeeCard({ userId }: { userId: string }) {
  const { data: card, isLoading } = useUserCard(userId);
  const { data: usersData } = useUsersList();
  const { data: presence } = usePresence();
  const tasksQuery = useAssigneeTasks(userId);
  const projectsQuery = useMemberProjects(userId);
  const startDirect = useStartDirectConversation();
  const openCard = useOpenCard();
  const navigate = useNavigate();
  const [tab, setTab] = useState<EmployeeTab>('profile');

  const items = useMemo(() => usersData?.items ?? [], [usersData]);
  const listItem = items.find((u) => u.id === userId);
  const manager = card?.managerId ? items.find((u) => u.id === card.managerId) : undefined;
  const subordinates = useMemo(() => items.filter((u) => u.managerId === userId), [items, userId]);
  const tasks = tasksQuery.data?.items ?? [];
  const projects = projectsQuery.data?.items ?? [];
  const presenceStatus: PresenceStatus =
    presence?.find((p) => p.user.id === userId)?.status ?? 'offline';

  if (isLoading || !card || !listItem) {
    return <EmployeeCardSkeleton />;
  }

  const tabs: { id: EmployeeTab; label: string; count?: number }[] = [
    { id: 'profile', label: ui.employees.tabProfile },
    {
      id: 'tasks',
      label: ui.employees.tabTasks,
      count: tasksQuery.data ? tasks.length : undefined,
    },
    {
      id: 'projects',
      label: ui.employees.tabProjects,
      count: projectsQuery.data ? projects.length : undefined,
    },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Полоса: аватар-якорь + presence + позиция (имя — в хроме слайдера) */}
      <div className="shrink-0 border-b border-border">
        <div className="content-fade flex items-center gap-3 px-5 py-3">
          <PersonAvatar
            name={card.displayName}
            avatarUrl={card.avatarUrl}
            className="size-10 shrink-0"
          />
          <NodeChip tone={presenceTone[presenceStatus]} className="shrink-0">
            <span
              aria-hidden
              className={
                presenceStatus === 'online'
                  ? 'size-1.5 rounded-full bg-success'
                  : presenceStatus === 'away'
                    ? 'size-1.5 rounded-full bg-warning'
                    : 'size-1.5 rounded-full bg-muted-foreground'
              }
            />
            {presenceLabel(presenceStatus)}
          </NodeChip>
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            {listItem.positionName ?? ''}
            {listItem.departmentName ? ` · ${listItem.departmentName}` : ''}
          </span>
        </div>
      </div>

      {/* Вкладки карточки (модель профиля Битрикс24, моно-ряд как у проекта) */}
      <div className="content-fade flex shrink-0 items-center gap-1 border-b border-border px-4">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id}
            className={cn(
              'flex h-10 items-center gap-2 rounded-none border-b-2 px-3 font-mono text-[11px] tracking-[0.14em] uppercase transition-colors',
              tab === t.id
                ? 'border-port text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground/80',
            )}
          >
            {t.label}
            {t.count !== undefined ? (
              <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                {t.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="content-fade min-h-0 flex-1 overflow-y-auto p-6 @container">
        <div className="mx-auto w-full max-w-4xl">
          {tab === 'profile' ? (
            <>
              <EntityFields
                defs={employeeProfileDefs({ card, listItem, manager, openCard })}
                storageKey={VISIBILITY_KEY}
              />
              <div className="mt-8">
                <NodeLabel label={ui.employees.subordinates} count={subordinates.length} />
              </div>
              <div className="mt-2.5 flex flex-col gap-1">
                {subordinates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{ui.common.empty}</p>
                ) : null}
                {subordinates.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => openCard({ kind: 'employee', id: person.id })}
                    className="flex items-center gap-2.5 rounded-md px-1 py-1.5 text-left text-sm hover:bg-accent/50"
                  >
                    <PersonAvatar name={person.displayName} className="size-7 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{person.displayName}</span>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {person.positionName ?? ''}
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {tab === 'tasks' ? (
            <div className="flex flex-col gap-1">
              {tasksQuery.isLoading ? (
                [0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)
              ) : tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">{ui.employees.noTasks}</p>
              ) : (
                tasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={(e) =>
                      openCard(
                        { kind: 'task', id: task.id },
                        e.currentTarget.getBoundingClientRect(),
                      )
                    }
                    className="flex items-center gap-3 rounded-md px-1 py-2 text-left text-sm hover:bg-accent/50"
                  >
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
                      № {task.number}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{task.title}</span>
                    <DeadlineChip deadline={task.deadline} />
                    <TaskStatusBadge stage={task.stage} />
                  </button>
                ))
              )}
            </div>
          ) : null}

          {tab === 'projects' ? (
            <div className="flex flex-col gap-1">
              {projectsQuery.isLoading ? (
                [0, 1].map((i) => <Skeleton key={i} className="h-10 w-full" />)
              ) : projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">{ui.employees.noProjects}</p>
              ) : (
                projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={(e) =>
                      openCard(
                        { kind: 'project', id: project.id },
                        e.currentTarget.getBoundingClientRect(),
                      )
                    }
                    className="flex items-center gap-3 rounded-md px-1 py-2 text-left text-sm hover:bg-accent/50"
                  >
                    <span className="shrink-0 font-mono text-[11px] text-info tabular-nums">
                      {project.code}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{project.name}</span>
                    {project.manager?.id === userId ? (
                      <NodeChip tone="success" className="shrink-0">
                        {ui.projects.myRole.manager}
                      </NodeChip>
                    ) : null}
                    {project.stageName ? (
                      <NodeChip tone="muted" className="shrink-0">
                        {project.stageName}
                      </NodeChip>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex h-16 shrink-0 items-center gap-2 border-t border-border px-5">
        <Button
          size="sm"
          disabled={startDirect.isPending}
          onClick={() =>
            startDirect.mutate(card.id, {
              onSuccess: (conversation) =>
                void navigate({
                  to: '/chat/$conversationId',
                  params: { conversationId: conversation.id },
                }),
            })
          }
        >
          <MessageSquare data-icon="inline-start" />
          {ui.employees.writeMessage}
        </Button>
      </div>
    </div>
  );
}

/** Скелетон карточки сотрудника зеркалит анатомию с вкладками. */
function EmployeeCardSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
        <Skeleton className="size-10 rounded-full" />
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-20" />
      </div>
      <div className="min-h-0 flex-1 space-y-4 p-6">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-4 w-2/3" />
        ))}
      </div>
      <div className="flex h-16 shrink-0 items-center border-t border-border px-5">
        <Skeleton className="h-7 w-44 rounded-md" />
      </div>
    </div>
  );
}
