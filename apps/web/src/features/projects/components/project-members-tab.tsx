import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { ProjectDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Empty, EmptyDescription, EmptyTitle } from '@nodus/ui/components/empty';
import { NodeChip } from '@nodus/ui/components/node-chip';
import { Skeleton } from '@nodus/ui/components/skeleton';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { useUsersList } from '../../../shared/api/users-list.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { PeoplePicker } from '../../../shared/ui/people-picker.js';
import { SegmentedControl } from '../../../shared/ui/segmented-control.js';
import { useInfiniteSentinel } from '../../../shared/views/use-infinite-sentinel.js';
import { useAddProjectMember, useRemoveProjectMember } from '../api/project-member-mutations.js';
import { useProjectMembers } from '../api/projects-api.js';
import {
  groupProjectMembers,
  manualMembershipKind,
  type ProjectMemberGroup,
} from '../lib/project-members.js';

const SOURCE_TONE = {
  manager: 'success',
  assistant: 'info',
  member: 'muted',
  task: 'muted',
  observer: 'muted',
} as const;

/**
 * Вкладка «Участники» (Р2 #52): открытый проект — просмотр живого состава с
 * источниками (руками не правится, состав живёт из задач); секретный —
 * управление руководством: добавить участника/наблюдателя, снять ручной
 * состав. Строки группируются по сотруднику, у каждого — чипы всех
 * источников (руководитель, помощник, из задач, добавлен вручную,
 * наблюдатель с видом).
 */
export function ProjectMembersTab({ project }: { project: ProjectDetail }) {
  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useProjectMembers(
    project.id,
  );
  const rows = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);
  const groups = useMemo(() => groupProjectMembers(rows), [rows]);
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useInfiniteSentinel(containerRef, sentinelRef, {
    hasNextPage,
    isFetchingNextPage,
    onLoadMore: () => void fetchNextPage(),
  });
  const openCard = useOpenCard();
  const remove = useRemoveProjectMember(project.id);
  const secret = project.visibility === 'secret';
  const canManage = project.access.canManageMembers;

  return (
    <div ref={containerRef} className="h-full overflow-y-auto p-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <p className="text-xs text-muted-foreground">
          {secret ? ui.projects.membersHintSecret : ui.projects.membersHintOpen}
        </p>

        {canManage ? <AddMemberRow projectId={project.id} secret={secret} /> : null}

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <Empty>
            <EmptyTitle>{ui.projects.membersEmpty}</EmptyTitle>
            <EmptyDescription>{ui.projects.membersHintOpen}</EmptyDescription>
          </Empty>
        ) : (
          <ul className="flex flex-col">
            {groups.map((group) => (
              <MemberRow
                key={group.user.id}
                group={group}
                canRemove={
                  canManage &&
                  manualMembershipKind(group) !== null &&
                  !group.sources.includes('manager') &&
                  !group.sources.includes('assistant')
                }
                onOpen={() => openCard({ kind: 'employee', id: group.user.id })}
                onRemove={() =>
                  remove.mutate({
                    userId: group.user.id,
                    kind: manualMembershipKind(group) ?? 'member',
                  })
                }
              />
            ))}
          </ul>
        )}

        {hasNextPage ? (
          <div ref={sentinelRef} className="flex justify-center py-2">
            {isFetchingNextPage ? <Skeleton className="h-8 w-40" /> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MemberRow({
  group,
  canRemove,
  onOpen,
  onRemove,
}: {
  group: ProjectMemberGroup;
  canRemove: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="group flex h-12 items-center gap-3 border-b border-border/60 px-2 last:border-b-0 hover:bg-accent/40">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        <PersonAvatar
          name={group.user.displayName}
          avatarUrl={group.user.avatarUrl}
          className="size-7 shrink-0"
        />
        <span className="min-w-0 truncate text-sm font-medium">{group.user.displayName}</span>
      </button>
      <span className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1">
        {group.sources.map((source) => (
          <NodeChip key={source} tone={SOURCE_TONE[source]}>
            {ui.projects.source[source]}
            {source === 'observer' && group.observerKind
              ? ` · ${ui.projects.observerKind[group.observerKind]}`
              : null}
          </NodeChip>
        ))}
      </span>
      {canRemove ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onRemove}
          aria-label={`${ui.projects.removeMember}: ${group.user.displayName}`}
          title={ui.projects.removeMember}
          className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Trash2 className="size-3.5" strokeWidth={1.75} />
        </Button>
      ) : (
        <span className="w-6 shrink-0" aria-hidden />
      )}
    </li>
  );
}

/** Добавление руководством: в секретный — участник или наблюдатель (участник
 *  может получать задачи, наблюдатель — только просмотр); в открытый —
 *  ТОЛЬКО наблюдатель (участники живут из задач, вердикт 29.10 В2). */
function AddMemberRow({ projectId, secret }: { projectId: string; secret: boolean }) {
  const { data: users } = useUsersList();
  const add = useAddProjectMember(projectId);
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [kind, setKind] = useState<'member' | 'observer'>('member');
  const selected = users?.items.find((user) => user.id === userId);

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2 self-start text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-3.5" strokeWidth={1.75} />
        {secret ? ui.projects.addMember : ui.projects.addObserver}
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2">
      <PeoplePicker
        selectedIds={userId ? [userId] : []}
        ariaLabel={ui.projects.addMember}
        onToggle={(id) => setUserId(id)}
      >
        <button
          type="button"
          aria-label={ui.projects.addMember}
          className="flex h-8 min-w-40 items-center gap-2 rounded-lg border border-input px-2.5 text-sm hover:bg-accent/40 dark:bg-input/30"
        >
          {selected ? (
            <>
              <PersonAvatar
                name={selected.displayName}
                avatarUrl={selected.avatarUrl}
                className="size-5"
              />
              <span className="truncate">{selected.displayName}</span>
            </>
          ) : (
            <span className="text-muted-foreground">{ui.common.notSet}</span>
          )}
        </button>
      </PeoplePicker>
      {secret ? (
        <SegmentedControl
          size="sm"
          ariaLabel={ui.projects.addMember}
          value={kind}
          options={[
            { value: 'member', label: ui.projects.memberKind.member },
            { value: 'observer', label: ui.projects.memberKind.observer },
          ]}
          onChange={setKind}
          activeClassName="bg-accent text-foreground"
          className="w-48"
        />
      ) : null}
      <Button
        type="button"
        size="sm"
        disabled={!userId || add.isPending}
        onClick={() =>
          add.mutate(
            { userId, kind: secret ? kind : 'observer' },
            {
              onSuccess: () => {
                setUserId('');
                setKind('member');
                setOpen(false);
              },
            },
          )
        }
      >
        {ui.common.add}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
        {ui.common.cancel}
      </Button>
      <span className="w-full text-xs text-muted-foreground">{ui.projects.memberKindHint}</span>
    </div>
  );
}
