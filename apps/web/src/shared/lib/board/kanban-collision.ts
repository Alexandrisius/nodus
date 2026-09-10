import type { Collision, CollisionDetection, UniqueIdentifier } from '@dnd-kit/core';
import { closestCenter, pointerWithin, rectIntersection } from '@dnd-kit/core';

/**
 * Collision-стратегия канбана (официальный паттерн dnd-kit multi-container):
 * указатель внутри колонки → ближайшая карточка ВНУТРИ неё (колонки-пустышки
 * остаются сами); вне пересечений — кэш lastOverId, иначе сразу после
 * межколоночного переезда раскладка «прыгает» и over теряется.
 *
 * Активная карточка ИСКЛЮЧЕНА из кандидатов (gotchas, воспроизведено пробой):
 * её droppable не отключается при drag (useSortable), а rect следует за
 * указателем (sortable-трансформ); pointerWithin сортирует по среднему
 * расстоянию до углов rect → самый маленький rect под указателем (сама
 * карточка) затеняет секцию колонки, и дроп в пустую колонку «залипал» на
 * ПЕРВОЙ пересечённой пустышке. Дроп «на себя» бессмыслен — исключаем из
 * pointerWithin, rectIntersection и closestCenter внутри колонки.
 */
export function makeKanbanCollision(args: {
  columnIds: () => string[];
  childrenOf: (columnId: string) => string[];
  lastOverId: { current: UniqueIdentifier | null };
  recentlyMoved: { current: boolean };
}): CollisionDetection {
  const { columnIds, childrenOf, lastOverId, recentlyMoved } = args;
  return (event): Collision[] => {
    const scoped = {
      ...event,
      droppableContainers: event.droppableContainers.filter(
        (c) => String(c.id) !== String(event.active.id),
      ),
    };
    const pointer = pointerWithin(scoped);
    const intersections = pointer.length > 0 ? pointer : rectIntersection(scoped);
    let overId = intersections[0]?.id ?? null;
    if (overId != null) {
      const columns = columnIds();
      if (columns.includes(String(overId))) {
        const children = childrenOf(String(overId)).filter((id) => id !== String(event.active.id));
        if (children.length > 0) {
          const closest = closestCenter({
            ...scoped,
            droppableContainers: scoped.droppableContainers.filter(
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
