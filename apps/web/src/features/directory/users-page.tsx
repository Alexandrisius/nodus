import { ui } from '@nodus/contracts';
import { Skeleton } from '@nodus/ui/components/skeleton';

import { useUsersList } from './api/directory-api.js';
import { OrgChart } from './components/org-chart.js';

/** Сотрудники: оргструктура на «бумаге» с карандашными связями. */
export function UsersPage() {
  const { data, isLoading } = useUsersList();

  return (
    <div className="relative h-full overflow-y-auto p-5">
      <h1 className="mb-2 text-xl font-semibold text-foreground">{ui.employees.title}</h1>
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <OrgChart people={data?.items ?? []} />
      )}
    </div>
  );
}
