import { Skeleton } from '@nodus/ui/components/skeleton';

/** Скелетон карточки проекта зеркалит реальную зональную геометрию
 *  (вердикт раунда 3): таб-бар вкладок слева, ТЁМНАЯ зона обсуждения
 *  справа шириной с живую колонку (структура — видна с первого кадра). */
export function ProjectCardSkeleton({ chatW }: { chatW: number }) {
  return (
    <div className="flex h-full flex-col">
      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
        <div className="flex min-h-0 flex-col border-r border-border">
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="ml-auto h-6 w-24 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <div className="min-h-0 flex-1 p-4">
            <div className="flex flex-col gap-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </div>
        </div>
        <div className="min-h-0 overflow-hidden" style={{ width: chatW }}>
          <div className="h-full bg-background p-4">
            <div className="flex flex-col gap-3">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-24 w-full max-w-2xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
