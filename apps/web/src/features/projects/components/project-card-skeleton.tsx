import { Skeleton } from '@nodus/ui/components/skeleton';

/** Скелетон карточки проекта зеркалит реальную зональную геометрию
 *  (референс — task-card-skeleton): полоса цепочки, паспорт + тулбар задач
 *  слева, ТЁМНАЯ зона обсуждения справа (структура — видна с первого кадра). */
export function ProjectCardSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="ml-auto h-6 w-24 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: 'minmax(0,1fr) 400px' }}>
        <div className="flex min-h-0 flex-col border-r border-border">
          <div className="shrink-0 space-y-3 px-5 pt-4 pb-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="grid grid-cols-2 gap-3">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-20" />
          </div>
          <div className="min-h-0 flex-1 p-4">
            <div className="flex flex-col gap-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </div>
        </div>
        <div className="min-h-0 bg-background p-4">
          <div className="flex flex-col gap-3">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-24 w-full max-w-2xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
