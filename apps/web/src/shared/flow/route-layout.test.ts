import { describe, expect, it } from 'vitest';

import { ROUTE_GEOMETRY, layoutBottom, layoutRoute } from './route-layout.js';

const stage = (
  id: string,
  systemState: 'backlog' | 'active' | 'paused' | 'closed',
  sortOrder = 0,
) => ({
  id,
  systemState,
  sortOrder,
  isInitial: false,
});

const tr = (fromStageId: string | null, toStageId: string) => ({ fromStageId, toStageId });

describe('route-layout: слоевая раскладка холста (#378)', () => {
  it('линейная цепочка ложится слоями слева направо с коридорами', () => {
    const layout = layoutRoute(
      [{ ...stage('a', 'backlog'), isInitial: true }, stage('b', 'active'), stage('c', 'closed')],
      [tr('a', 'b'), tr('b', 'c')],
    );
    expect(layout.get('a')!.layer).toBe(0);
    expect(layout.get('b')!.layer).toBe(1);
    expect(layout.get('c')!.layer).toBe(2);
    expect(layout.get('b')!.x - layout.get('a')!.x).toBe(
      ROUTE_GEOMETRY.stageWidth + ROUTE_GEOMETRY.layerGap,
    );
  });

  it('длиннейший путь: вилка сходится на максимуме слоёв', () => {
    const layout = layoutRoute(
      [
        { ...stage('a', 'backlog'), isInitial: true },
        stage('b', 'active'),
        stage('c', 'active'),
        stage('d', 'closed'),
      ],
      [tr('a', 'b'), tr('a', 'c'), tr('b', 'd'), tr('c', 'd')],
    );
    expect(layout.get('d')!.layer).toBe(2);
    // Ветки одного слоя — в разных рядах.
    expect(layout.get('b')!.y).not.toBe(layout.get('c')!.y);
  });

  it('цикл не ломает раскладку (капта итераций)', () => {
    const layout = layoutRoute(
      [{ ...stage('a', 'backlog'), isInitial: true }, stage('b', 'active'), stage('c', 'closed')],
      [tr('a', 'b'), tr('b', 'c'), tr('c', 'b')],
    );
    expect(layout.size).toBe(3);
    expect(layout.get('b')!.layer).toBeGreaterThan(layout.get('a')!.layer);
  });

  it('недостижимые статусы уходят за достижимые отдельным слоем', () => {
    const layout = layoutRoute(
      [
        { ...stage('a', 'backlog'), isInitial: true },
        stage('b', 'active'),
        stage('orphan', 'active'),
      ],
      [tr('a', 'b')],
    );
    expect(layout.get('orphan')!.layer).toBeGreaterThan(layout.get('b')!.layer);
  });

  it('кнопка «из любого» достижима от старта; её возврат в старт не поднимает слой старта', () => {
    const layout = layoutRoute(
      [
        { ...stage('a', 'backlog'), isInitial: true },
        stage('b', 'active'),
        stage('cancel', 'closed'),
      ],
      [tr('a', 'b'), tr(null, 'cancel'), tr('cancel', 'a')],
    );
    expect(layout.get('a')!.layer).toBe(0);
    expect(layout.get('cancel')!.layer).toBe(1);
  });

  it('внутри слоя порядок стабилен: этап → sortOrder → id', () => {
    const first = layoutRoute(
      [
        { ...stage('z', 'backlog'), isInitial: true },
        { ...stage('a2', 'active'), sortOrder: 1 },
        { ...stage('a1', 'active'), sortOrder: 0 },
        { ...stage('p', 'paused'), sortOrder: 5 },
      ],
      [],
    );
    const second = layoutRoute(
      [
        { ...stage('z', 'backlog'), isInitial: true },
        { ...stage('a2', 'active'), sortOrder: 1 },
        { ...stage('a1', 'active'), sortOrder: 0 },
        { ...stage('p', 'paused'), sortOrder: 5 },
      ],
      [],
    );
    expect([...first.keys()]).toEqual([...second.keys()]);
    expect(first.get('a1')!.y).toBeLessThan(first.get('a2')!.y);
    expect(first.get('a2')!.y).toBeLessThan(first.get('p')!.y);
  });

  it('layoutBottom — низ самой нижней карточки', () => {
    const layout = layoutRoute(
      [{ ...stage('a', 'backlog'), isInitial: true }, stage('b', 'active'), stage('c', 'active')],
      [tr('a', 'b'), tr('a', 'c')],
    );
    const bottom = layoutBottom([{ id: 'a' }, { id: 'b' }, { id: 'c' }], layout);
    const maxCardBottom = Math.max(
      ...['a', 'b', 'c'].map((id) => layout.get(id)!.y + ROUTE_GEOMETRY.stageHeight),
    );
    expect(bottom).toBe(maxCardBottom);
  });
});
