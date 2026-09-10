import type { Collision, CollisionDetection, UniqueIdentifier } from '@dnd-kit/core';
import { closestCenter, pointerWithin, rectIntersection } from '@dnd-kit/core';

/**
 * Collision-стратегия канбана (официальный паттерн dnd-kit multi-container):
 * указатель внутри колонки → ближайшая карточка ВНУТРИ неё (колонки-пустышки
 * остаются сами); вне пересечений — кэш lastOverId, иначе сразу после
 * межколоночного переезда раскладка «прыгает» и over теряется.
 */
export function makeKanbanCollision(args: {
  columnIds: () => string[];
  childrenOf: (columnId: string) => string[];
  lastOverId: { current: UniqueIdentifier | null };
  recentlyMoved: { current: boolean };
}): CollisionDetection {
  const { columnIds, childrenOf, lastOverId, recentlyMoved } = args;
  return (event): Collision[] => {
    const pointer = pointerWithin(event);
    const intersections = pointer.length > 0 ? pointer : rectIntersection(event);
    let overId = intersections[0]?.id ?? null;
    if (overId != null) {
      const columns = columnIds();
      if (columns.includes(String(overId))) {
        const children = childrenOf(String(overId));
        if (children.length > 0) {
          const closest = closestCenter({
            ...event,
            droppableContainers: event.droppableContainers.filter(
              (c) => String(c.id) !== String(overId) && children.includes(String(c.id)),
            ),
          });
          overId = closest[0]?.id ?? overId;
        }
      }
      lastOverId.current = overId;
      return [{ id: overId }];
    }
    if (recentlyMoved.current) lastOverId.current = event.active.id;
    return lastOverId.current ? [{ id: lastOverId.current }] : [];
  };
}
