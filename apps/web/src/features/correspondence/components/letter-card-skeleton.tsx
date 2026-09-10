import { Skeleton } from '@nodus/ui/components/skeleton';

/** Скелетон карточки письма зеркалит реальную геометрию (референс
 *  task-card-skeleton): полоса цепочки, документ max-w-4xl, нижний бар h-16 —
 *  читается как «карточка прогружается», а не единый прямоугольник. */
export function LetterCardSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center border-b border-border px-5 py-3">
        <Skeleton className="h-6 w-56" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden p-6">
        <div className="mx-auto w-full max-w-4xl space-y-6">
          <div className="space-y-2.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-3/5" />
          </div>
          <div className="grid grid-cols-1 gap-x-12 gap-y-3 @min-[880px]:grid-cols-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
          <Skeleton className="h-16 w-2/3" />
        </div>
      </div>
      <div className="flex h-16 shrink-0 items-center gap-2 border-t border-border px-5">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-7 w-32 shrink-0 rounded-md" />
      </div>
    </div>
  );
}
