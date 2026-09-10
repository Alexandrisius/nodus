import { Skeleton } from '@nodus/ui/components/skeleton';

/** Скелетон карточки по форме реальной раскладки (та же ширина чата — без
 *  скачка при подстановке данных; замоноличенный бар действий внизу — как
 *  у загруженной карточки): читается как «карточка прогружается», а не как
 *  единый тёмный прямоугольник. */
export function TaskCardSkeleton({ chatW }: { chatW: number }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center border-b border-border px-5 py-3">
        <Skeleton className="h-6 w-80" />
      </div>
      <div
        className="grid min-h-0 flex-1"
        style={{ gridTemplateColumns: `minmax(0,1fr) 6px ${chatW}px` }}
      >
        <div className="flex min-h-0 flex-col">
          <div className="min-h-0 flex-1 space-y-6 overflow-hidden p-6">
            <Skeleton className="h-8 w-2/3" />
            <div className="space-y-2.5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-4/5" />
            </div>
            <div className="flex flex-wrap gap-3">
              <Skeleton className="h-44 w-full min-w-72 max-w-[420px] flex-1" />
              <Skeleton className="h-44 w-full min-w-72 max-w-[420px] flex-1" />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 border-t border-border px-5 py-3">
            <Skeleton className="h-7 w-28 rounded-md" />
            <Skeleton className="h-7 w-32 rounded-md" />
          </div>
        </div>
        <div className="relative">
          <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
        </div>
        <div className="flex min-h-0 flex-col gap-3 bg-background p-4">
          <Skeleton className="h-14 w-3/4 self-start" />
          <Skeleton className="h-14 w-2/3 self-end" />
          <Skeleton className="h-14 w-3/4 self-start" />
          <Skeleton className="mt-auto h-11 w-full" />
        </div>
      </div>
    </div>
  );
}
