import { Skeleton } from '@nodus/ui/components/skeleton';

/** Скелетон карточки сотрудника зеркалит анатомию с колонкой чата
 *  (ширина — живая, из useChatWidth: панель не прыгает при подмене). */
export function EmployeeCardSkeleton({ chatW }: { chatW: number }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
        <Skeleton className="size-10 rounded-full" />
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
        <div className="flex min-h-0 flex-col border-r border-border">
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
        </div>
        <div className="min-h-0 overflow-hidden" style={{ width: chatW }}>
          <div className="flex flex-col gap-3 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-2/3" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
