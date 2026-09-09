import { useCallback, useRef } from 'react';
import { cn } from '@nodus/ui/lib/utils';

/**
 * Ручка регулировки ширины колонки (правая грань хедера таблицы): тянем —
 * ширина меняется живьём, значение пишется в пресет вида и переживает
 * сессии. Без зависимостей: pointer capture + window listeners.
 */
export function ColumnResizer({
  width,
  minWidth,
  onResize,
}: {
  width: number;
  minWidth: number;
  onResize: (width: number) => void;
}) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLSpanElement>) => {
      event.preventDefault();
      event.stopPropagation();
      drag.current = { startX: event.clientX, startWidth: width };
      const onMove = (e: PointerEvent) => {
        if (!drag.current) return;
        const next = Math.round(drag.current.startWidth + (e.clientX - drag.current.startX));
        onResize(Math.max(minWidth, next));
      };
      const onUp = () => {
        drag.current = null;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [width, minWidth, onResize],
  );

  return (
    <span
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
      className={cn(
        'absolute top-0 right-0 z-10 h-full w-2 cursor-col-resize touch-none',
        'after:absolute after:top-1/4 after:right-0.5 after:h-1/2 after:w-px after:bg-border after:transition-colors hover:after:bg-input',
      )}
    />
  );
}
