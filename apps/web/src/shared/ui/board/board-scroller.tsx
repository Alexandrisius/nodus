import { useRef, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '@nodus/ui/lib/utils';

import { EDGE_ZONE_PX, type EdgeSide } from '../../lib/board/edge-scroll.js';
import { useBoardEdgeScroll } from './use-board-edge-scroll.js';

/**
 * Горизонтальный скроллер канбан-доски — общий для всех досок (#366):
 * ряд колонок + навигация широкой доски (прокрутка подводом курсора к краю,
 * drag-to-pan фона — `use-board-edge-scroll`). Зоны края — индикаторы
 * поверх доски БЕЗ перехвата указателя: клики и меню крайних колонок
 * проходят насквозь, видны только когда в эту сторону есть куда листать.
 * className — отступы конкретной доски (их же зеркалит KanbanSkeleton).
 */
export function BoardScroller({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { room, hot, panning, handlers } = useBoardEdgeScroll(ref);

  return (
    <div className="relative h-full min-h-0">
      <div
        ref={ref}
        data-board-scroller=""
        className={cn(
          'flex h-full gap-5 overflow-x-auto px-6 pb-4',
          panning && 'cursor-grabbing select-none',
          className,
        )}
        {...handlers}
      >
        {children}
      </div>
      <EdgeHint side="left" visible={room.left} hot={hot === 'left'} />
      <EdgeHint side="right" visible={room.right} hot={hot === 'right'} />
    </div>
  );
}

function EdgeHint({ side, visible, hot }: { side: EdgeSide; visible: boolean; hot: boolean }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <div
      aria-hidden
      data-edge-hint={side}
      style={{ width: EDGE_ZONE_PX }}
      className={cn(
        'pointer-events-none absolute inset-y-0 flex items-center justify-center rounded-lg transition-[opacity,background-color] duration-150',
        side === 'left' ? 'left-0' : 'right-0',
        visible ? 'opacity-100' : 'opacity-0',
        hot && 'bg-accent/30',
      )}
    >
      <span
        className={cn(
          'flex size-8 items-center justify-center rounded-full border border-border bg-card transition-colors',
          hot ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        <Icon className="size-4" strokeWidth={1.75} />
      </span>
    </div>
  );
}
