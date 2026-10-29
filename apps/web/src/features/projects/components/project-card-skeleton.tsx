import { Skeleton } from '@nodus/ui/components/skeleton';

/** Скелетон карточки проекта зеркалит новую зональную геометрию (вердикт
 *  07.11.2026): слева панель «О проекте» с нижним баром, справа рабочая
 *  зона с полосой вкладок — структура видна с первого кадра. */
export function ProjectCardSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        <div className="flex w-[42%] min-w-0 shrink-0 flex-col border-r border-border">
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-6">
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-lg" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
            <Skeleton className="h-16 w-full" />
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-8 w-full" />
            ))}
          </div>
          <div className="flex h-16 shrink-0 items-center gap-2 border-t border-border px-5">
            <Skeleton className="h-8 w-36" />
            <Skeleton className="size-8" />
          </div>
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-16" />
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
