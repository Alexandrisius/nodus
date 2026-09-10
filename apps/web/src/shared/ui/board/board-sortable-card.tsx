import { memo, useEffect, useState, type ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { cn } from '@nodus/ui/lib/utils';

/** Карточка смонтирована хотя бы один кадр (официальный useMountStatus):
 * перемонтированная в чужую колонку ВО ВРЕМЯ drag карточка не должна стартовать
 * транзишен с неверных координат — первый кадр без transition. */
function useMountStatus(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return mounted;
}

/**
 * Sortable-обёртка карточки борда (ADR-0007, общая оболочка канбана):
 * useSortable даёт живую сортировку (трансформы уступания места соседями),
 * призрак рисует DragOverlay потребителя. Трансформ sortable — всегда (и у
 * активного): он двигает полупрозрачный слот к проекционной позиции; без него
 * слот стоит и налезает на соседей. Контент карточки — render-проп
 * (placeholder — слот переносимой карточки, пунктир).
 * Сенсоры на активаторе: клик без движения — открытие слайдера
 * (distance-констрейнт PointerSensor задаёт потребитель борда).
 */
export const BoardSortableCard = memo(function BoardSortableCard({
  id,
  stageId,
  children,
}: {
  id: string;
  stageId: string;
  children: (state: { placeholder: boolean }) => ReactNode;
}) {
  const {
    setNodeRef,
    setActivatorNodeRef,
    listeners,
    attributes,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, data: { stageId } });
  const mounted = useMountStatus();
  const mountedWhileDragging = isDragging && !mounted;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: mountedWhileDragging ? undefined : transition,
      }}
    >
      <div
        ref={setActivatorNodeRef}
        className={cn('cursor-grab', isDragging && 'opacity-40')}
        {...listeners}
        {...attributes}
      >
        {children({ placeholder: isDragging })}
      </div>
    </div>
  );
});
