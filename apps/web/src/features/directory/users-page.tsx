import { ui } from '@nodus/contracts';
import { Skeleton } from '@nodus/ui/components/skeleton';

import { useUsersList } from './api/directory-api.js';
import { PersonAvatar } from '../../shared/ui/person-avatar.js';

/** Сотрудники: справочник с аватарами, должностями и подразделениями. */
export function UsersPage() {
  const { data, isLoading } = useUsersList();

  return (
    <div className="relative h-full overflow-y-auto p-5">
      <h1 className="mb-4 text-xl font-semibold text-white drop-shadow-sm">{ui.employees.title}</h1>
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          {(data?.items ?? []).map((person) => (
            <div
              key={person.id}
              className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0"
            >
              <PersonAvatar name={person.displayName} className="size-10" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{person.displayName}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {person.positionName} · {person.departmentName}
                </div>
              </div>
              <div className="hidden text-sm text-muted-foreground md:block">{person.email}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
