import { Building2, Mail, MessageSquare, User, UserCog, Briefcase } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { PresenceStatus } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { NodeChip } from '@nodus/ui/components/node-chip';
import { Skeleton } from '@nodus/ui/components/skeleton';

import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { EntityFields, type EntityFieldDef } from '../../../shared/ui/entity-fields.js';
import { useStartDirectConversation } from '../../../shared/chat/api.js';
import { usePresence, useUsersList } from '../api/directory-api.js';
import { UserStatusChip } from '../lib/employee-fields.js';

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

/**
 * Карточка сотрудника (слайдер): аватар-якорь с presence-чипом в полосе,
 * поля-реестр общим каркасом EntityFields (должность, подразделение, почта,
 * руководитель — переход в его карточку без закрытия слайдера, HR-статус);
 * замоноличенный нижний бар h-16 — «Написать сообщение» (find-or-create
 * личного диалога в мессенджере, startDirectBodySchema). Полное имя — в хроме
 * слайдера (title), в теле не дублируется (канон карточки).
 */
export function EmployeeCard({ userId }: { userId: string }) {
  const { data, isLoading } = useUsersList();
  const { data: presence } = usePresence();
  const startDirect = useStartDirectConversation();
  const navigate = useNavigate();

  const items = useMemo(() => data?.items ?? [], [data]);
  const user = items.find((u) => u.id === userId);
  const manager = user?.managerId ? items.find((u) => u.id === user.managerId) : undefined;
  const presenceStatus: PresenceStatus =
    presence?.find((p) => p.user.id === userId)?.status ?? 'offline';

  if (isLoading || !user) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
          <Skeleton className="size-10 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <div className="min-h-0 flex-1 space-y-4 p-6">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-4 w-2/3" />
          ))}
        </div>
        <div className="flex h-16 shrink-0 items-center border-t border-border px-5">
          <Skeleton className="h-7 w-44 rounded-md" />
        </div>
      </div>
    );
  }

  const defs: EntityFieldDef[] = [
    {
      key: 'position',
      icon: <Briefcase className="size-3.5" />,
      label: ui.employees.position,
      render: () => user.positionName ?? ui.common.notSet,
    },
    {
      key: 'department',
      icon: <Building2 className="size-3.5" />,
      label: ui.employees.department,
      render: () =>
        user.departmentName ? (
          <span className="font-mono text-[12px] text-info">{user.departmentName}</span>
        ) : (
          ui.common.notSet
        ),
    },
    {
      key: 'email',
      icon: <Mail className="size-3.5" />,
      label: ui.employees.email,
      render: () => <span className="font-mono text-[12px]">{user.email}</span>,
    },
    {
      key: 'manager',
      icon: <UserCog className="size-3.5" />,
      label: ui.employees.fieldManager,
      render: () =>
        manager ? (
          <button
            type="button"
            onClick={() =>
              void navigate({
                to: '/employees/$userId',
                params: { userId: manager.id },
                search: (prev) => prev,
              })
            }
            className="flex min-w-0 items-center gap-2 hover:underline"
          >
            <PersonAvatar name={manager.displayName} className="size-6 shrink-0" />
            <span className="truncate">{manager.displayName}</span>
          </button>
        ) : (
          ui.common.notSet
        ),
    },
    {
      key: 'status',
      icon: <User className="size-3.5" />,
      label: ui.employees.fieldStatus,
      render: () => <UserStatusChip status={user.status} />,
    },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Полоса: аватар-якорь + presence (имя — в хроме слайдера, не здесь) */}
      <div className="shrink-0 border-b border-border">
        <div className="content-fade flex items-center gap-3 px-5 py-3">
          <PersonAvatar
            name={user.displayName}
            avatarUrl={user.avatarUrl}
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
        </div>
      </div>

      <div className="content-fade min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto w-full max-w-4xl">
          <EntityFields defs={defs} storageKey={VISIBILITY_KEY} />
        </div>
      </div>

      <div className="flex h-16 shrink-0 items-center gap-2 border-t border-border px-5">
        <Button
          size="sm"
          disabled={startDirect.isPending}
          onClick={() =>
            startDirect.mutate(user.id, {
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
