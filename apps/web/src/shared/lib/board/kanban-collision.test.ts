import { describe, expect, it } from 'vitest';
import type { CollisionDetection, UniqueIdentifier } from '@dnd-kit/core';

import { makeKanbanCollision } from './kanban-collision.js';

/**
 * Тесты collision-стратегии канбана. Ключевой регрессионный кейс (gotchas):
 * активная карточка исключена из кандидатов — иначе её rect, следующий за
 * указателем, затеняет пустую колонку (pointerWithin сортирует по среднему
 * расстоянию до углов: мелкий rect выигрывает у секции колонки), и дроп
 * «залипал» на первой пересечённой пустышке.
 */

interface Point {
  x: number;
  y: number;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function rect({ top, left, width, height }: Rect) {
  return {
    top,
    left,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

/** Минимальный контейнер dnd-kit: collision-функции читают только id (+ rect через карту). */
function container(id: string) {
  return { id } as never;
}

function makeEvent(args: {
  activeId: string;
  pointer: Point | null;
  containers: string[];
  rects: Record<string, Rect>;
  collisionRect?: Rect;
}): Parameters<CollisionDetection>[0] {
  return {
    active: { id: args.activeId },
    collisionRect: rect(args.collisionRect ?? { top: 0, left: 0, width: 0, height: 0 }),
    pointerCoordinates: args.pointer,
    droppableContainers: args.containers.map(container),
    droppableRects: new Map(
      Object.entries(args.rects).map(([id, r]) => [id as UniqueIdentifier, rect(r)]),
    ),
    measuringScheduled: false,
    scrollableAncestors: [],
    scrollableAncestorRects: [],
  } as unknown as Parameters<CollisionDetection>[0];
}

function makeCollision(columns: string[], children: Record<string, string[]>) {
  return makeKanbanCollision({
    columnIds: () => columns,
    childrenOf: (columnId) => children[columnId] ?? [],
    lastOverId: { current: null },
    recentlyMoved: { current: false },
  });
}

/** Геометрия борда: колонки A,B,C подряд (300px каждая), карточка 260×100. */
const COLUMN = (x: number): Rect => ({ top: 0, left: x, width: 300, height: 800 });
const CARD = (x: number, y: number): Rect => ({ top: y, left: x + 20, width: 260, height: 100 });

describe('makeKanbanCollision', () => {
  it('указатель в пустой колонке → over = колонка, даже когда rect активной карточки под указателем', () => {
    const collision = makeCollision(['a', 'b', 'c'], { a: ['t1'], b: [], c: [] });
    const event = makeEvent({
      activeId: 't1',
      // t1 живо переехала в колонку B (трансформ следует за указателем),
      // указатель уже в колонке C — поверх rect активной карточки.
      pointer: { x: 750, y: 400 },
      containers: ['a', 'b', 'c', 't1'],
      rects: {
        a: COLUMN(0),
        b: COLUMN(300),
        c: COLUMN(600),
        t1: CARD(620, 350), // активная карточка — мелкий rect под указателем
      },
    });
    const result = collision(event);
    expect(result[0]?.id).toBe('c');
  });

  it('указатель в непустой колонке → over = ближайшая карточка колонки, не активная', () => {
    const collision = makeCollision(['a', 'b'], { a: ['t1'], b: ['t2', 't3'] });
    const event = makeEvent({
      activeId: 't1',
      pointer: { x: 450, y: 260 }, // над карточкой t3 в колонке B
      containers: ['a', 'b', 't1', 't2', 't3'],
      rects: {
        a: COLUMN(0),
        b: COLUMN(300),
        t1: CARD(320, 210), // активная тоже под указателем
        t2: CARD(300, 40),
        t3: CARD(300, 220),
      },
    });
    const result = collision(event);
    expect(result[0]?.id).toBe('t3');
  });

  it('fallback rectIntersection: активная карточка не выигрывает сама у себя (100% пересечение)', () => {
    const collision = makeCollision(['a', 'b'], { a: ['t1'], b: [] });
    const event = makeEvent({
      activeId: 't1',
      pointer: null, // нет координат указателя (клавиатура) — fallback по rect
      collisionRect: { top: 100, left: 350, width: 260, height: 100 }, // карточка над B
      containers: ['a', 'b', 't1'],
      rects: {
        a: COLUMN(0),
        b: COLUMN(300),
        t1: { top: 100, left: 350, width: 260, height: 100 }, // её исходный rect
      },
    });
    const result = collision(event);
    expect(result[0]?.id).toBe('b');
  });
});
