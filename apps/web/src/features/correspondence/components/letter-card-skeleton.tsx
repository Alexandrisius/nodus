import { Skeleton } from '@nodus/ui/components/skeleton';

/** Скелетон карточки письма зеркалит почтовую анатомию (раунд 2): полоса
 *  цепочки, почтовая шапка (организация + мета), строки тела, плитки вложений,
 *  нижний бар h-16 — читается как «письмо прогружается». */
export function LetterCardSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center border-b border-border px-5 py-3">
        <Skeleton className="h-6 w-56" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden p-6">
        <div className="mx-auto w-full max-w-4xl space-y-6">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-3 w-72" />
            </div>
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
          <div className="space-y-2.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/5" />
          </div>
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-44" />
            ))}
          </div>
        </div>
      </div>
      <div className="flex h-16 shrink-0 items-center gap-2 border-t border-border px-5">
        <Skeleton className="h-8 flex-1" />
        <Skeleton className="h-7 w-32 shrink-0 rounded-md" />
      </div>
    </div>
  );
}
