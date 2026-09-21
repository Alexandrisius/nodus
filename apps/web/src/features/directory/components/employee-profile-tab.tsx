import type { PresenceStatus, UserCard, UserListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { NodeChip } from '@nodus/ui/components/node-chip';
import { NodeLabel } from '@nodus/ui/components/node-label';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { EntityFields } from '../../../shared/ui/entity-fields.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
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

/**
 * Вкладка «Профиль» карточки сотрудника (вердикт владельца 15.09.2026,
 * модель профиля Битрикс24): БОЛЬШАЯ фотография (не аватарка в баре —
 * общего бара с дублирующей инфой больше нет, полезная высота — данным) с
 * presence-чипом под ней; правее — поля-реестр полного UserCard (на узкой
 * зоне поля уходят под фото); ниже — «Подчинённые» (переход в их карточки
 * стеком, ADR-0009).
 */
export function EmployeeProfileTab({
  card,
  listItem,
  manager,
  subordinates,
  presenceStatus,
}: {
  card: UserCard;
  listItem: UserListItem;
  manager: UserListItem | undefined;
  subordinates: UserListItem[];
  presenceStatus: PresenceStatus;
}) {
  const openCard = useOpenCard();

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto w-full max-w-4xl">
        <div className="flex flex-wrap items-start gap-8">
          {/* Большое фото профиля (реф — карточка фото в профиле Битрикс24):
              Ø176, инициалы крупно, когда фото нет; presence — чипом под
              фото (точка + подпись). */}
          <div className="flex shrink-0 flex-col items-center gap-2.5">
            <PersonAvatar
              name={card.displayName}
              avatarUrl={card.avatarUrl}
              className="size-44"
              fallbackClass="text-4xl"
            />
            <NodeChip tone={presenceTone[presenceStatus]}>
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
          <div className="min-w-0 flex-1 basis-[30rem]">
            <EntityFields
              defs={employeeProfileDefs({ card, listItem, manager, openCard })}
              storageKey={VISIBILITY_KEY}
            />
          </div>
        </div>
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
              <span className="shrink-0 text-xs text-muted-foreground">
                {person.positionName ?? ''}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
