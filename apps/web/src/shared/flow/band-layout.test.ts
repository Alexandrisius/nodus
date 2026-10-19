import { describe, expect, it } from 'vitest';

import { BAND_GEOMETRY, BAND_ORDER, bandHeight, layoutBands, slotIndexAt } from './band-layout.js';

const stage = (id: string, systemState: 'backlog' | 'active' | 'closed', sortOrder = 0) => ({
  id,
  systemState,
  sortOrder,
});

describe('band-layout: колонки этапов (#378)', () => {
  it('пять колонок всегда, в порядке Ожидание → Итог', () => {
    const { bands } = layoutBands([]);
    expect(bands.map((b) => b.systemState)).toEqual([...BAND_ORDER]);
    expect(bands.every((b) => b.height >= BAND_GEOMETRY.minHeight)).toBe(true);
  });

  it('статусы встают в свою колонку по sortOrder', () => {
    const { bands, stages } = layoutBands([
      stage('a', 'backlog', 1),
      stage('b', 'backlog', 0),
      stage('c', 'active'),
    ]);
    const backlog = bands[0]!;
    expect(backlog.stageIds).toEqual(['b', 'a']);
    expect(stages.find((s) => s.id === 'a')!.bandId).toBe(backlog.id);
    expect(stages.find((s) => s.id === 'a')!.index).toBe(1);
    expect(stages.find((s) => s.id === 'c')!.bandId).toBe(bands[1]!.id);
  });

  it('высота колонки растёт с числом статусов', () => {
    expect(bandHeight(0)).toBe(BAND_GEOMETRY.minHeight);
    expect(bandHeight(4)).toBeGreaterThan(bandHeight(1));
  });

  it('слот по вертикальной координате после перетаскивания клампится', () => {
    const layout = layoutBands([
      stage('a', 'backlog', 0),
      stage('b', 'backlog', 1),
      stage('c', 'backlog', 2),
    ]);
    const g = BAND_GEOMETRY;
    const step = g.stageHeight + g.stageGap;
    expect(slotIndexAt(layout, 'b', g.headerHeight + 0.4 * step)).toBe(0);
    expect(slotIndexAt(layout, 'b', g.headerHeight + 1.4 * step)).toBe(1);
    expect(slotIndexAt(layout, 'b', 1_000)).toBe(2);
    expect(slotIndexAt(layout, 'b', -50)).toBe(0);
  });
});
