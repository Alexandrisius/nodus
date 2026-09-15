import { Skeleton } from '@nodus/ui/components/skeleton';

import { cn } from '@nodus/ui/lib/utils';

/** Скелетон канбан-доски — единый для всех досок (аудит #45: копии в
 *  task/project канбанах разъехались классами). className — классы
 *  контейнера СВОЕЙ доски (скелетон зеркалит её геометрию). */
export function KanbanSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex h-full gap-5 overflow-x-auto px-6 pt-3 pb-4', className)}>
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-full w-72 shrink-0" />
      ))}
    </div>
  );
}
