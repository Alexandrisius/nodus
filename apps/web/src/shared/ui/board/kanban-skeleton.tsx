import { Skeleton } from '@nodus/ui/components/skeleton';

import { cn } from '@nodus/ui/lib/utils';

/** Скелетон канбан-доски — единый для всех досок (аудит #45: копии в
 *  task/project канбанах разъехались классами). className — классы
 *  контейнера СВОЕЙ доски (скелетон зеркалит её геометрию); columns — число
 *  колонок, когда стадии уже известны (иначе 4): доска не «дребезжит»
 *  сменой числа колонок при доливке фидов. */
export function KanbanSkeleton({
  className,
  columns = 4,
}: {
  className?: string;
  columns?: number;
}) {
  return (
    <div className={cn('flex h-full gap-5 overflow-x-auto px-6 pt-3 pb-4', className)}>
      {Array.from({ length: columns }, (_, i) => i).map((i) => (
        <Skeleton key={i} className="h-full w-72 shrink-0" />
      ))}
    </div>
  );
}
