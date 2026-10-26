import { Skeleton } from '@nodus/ui/components/skeleton';

/** Скелет карточки письма зеркалит её анатомию (#55): полоса цепочки, доска
 *  полей парами, плитки файлов, нижний бар h-16; справа — полоса вкладок и
 *  документ в колонке текущей ширины (без скачка раскладки при загрузке). */
export function LetterCardSkeleton({ sideW }: { sideW: number }) {
  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-5">
        <Skeleton className="h-8 w-44 rounded-lg" />
        <Skeleton className="ml-auto h-4 w-28" />
        <Skeleton className="h-6 w-28" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="content-fade flex min-h-0 min-w-0 flex-1 flex-col border-r border-border">
          <div className="min-h-0 flex-1 overflow-hidden p-6">
            <div className="mx-auto mt-5 grid max-w-4xl grid-cols-2 gap-x-12 gap-y-3">
              {Array.from({ length: 10 }, (_, i) => (
                <Skeleton key={i} className="h-7 w-full" />
              ))}
            </div>
            <div className="mx-auto mt-8 flex max-w-4xl gap-3">
              <Skeleton className="h-12 w-64" />
              <Skeleton className="h-12 w-64" />
            </div>
          </div>
          <div className="flex h-16 shrink-0 items-center gap-2 border-t border-border px-5">
            <Skeleton className="h-8 w-44" />
          </div>
        </div>
        <div className="min-h-0 shrink-0 overflow-hidden bg-background" style={{ width: sideW }}>
          <div className="flex h-10 items-center gap-4 border-b border-border px-4">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-12" />
          </div>
          <div className="content-fade p-6">
            <Skeleton className="mx-auto h-[28rem] w-full max-w-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
