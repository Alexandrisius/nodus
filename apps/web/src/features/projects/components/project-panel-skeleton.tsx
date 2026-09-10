import { Skeleton } from '@nodus/ui/components/skeleton';

/** Скелетон панели проекта зеркалит реальную геометрию (референс
 *  task-card-skeleton): полоса цепочки, ряд вкладок, строки списка. */
export function ProjectPanelSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="ml-auto h-6 w-24 rounded-full" />
      </div>
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-4 py-2">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-16" />
      </div>
      <div className="min-h-0 flex-1 p-4">
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
