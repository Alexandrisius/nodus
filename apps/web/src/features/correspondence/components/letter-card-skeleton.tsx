import { Skeleton } from '@nodus/ui/components/skeleton';

/** Скелетон карточки письма зеркалит анатомию единого шаблона v2: полоса
 *  цепочки, почтовая шапка (организация + мета), строки тела, плитки вложений,
 *  нижний бар h-16; справа — колонка чата текущей ширины (без скачка
 *  раскладки при загрузке письма). */
export function LetterCardSkeleton({ chatW }: { chatW: number }) {
  return (
    <div className="flex h-full min-w-0">
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-5">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="ml-auto h-5 w-24" />
        </div>
        <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
          <div className="content-fade flex min-h-0 flex-col border-r border-border">
            <div className="min-h-0 flex-1 overflow-hidden p-6">
              <div className="flex items-start gap-3">
                <Skeleton className="size-10 shrink-0 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-56" />
                  <Skeleton className="h-3 w-72" />
                </div>
                <Skeleton className="h-6 w-24" />
              </div>
              <div className="mt-5 max-w-3xl space-y-2.5">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/5" />
              </div>
              <div className="mt-6 flex gap-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-12 w-44" />
                ))}
              </div>
              <Skeleton className="mt-6 h-32 w-full max-w-4xl" />
            </div>
            <div className="flex h-16 shrink-0 items-center gap-2 border-t border-border px-5">
              <Skeleton className="h-8 w-40" />
            </div>
          </div>
          <div className="min-h-0 overflow-hidden bg-background" style={{ width: chatW }}>
            <div className="content-fade flex flex-col gap-3 p-4">
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="ml-auto h-10 w-1/2" />
              <Skeleton className="h-10 w-3/5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
