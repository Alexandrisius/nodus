import { describe, expect, it } from 'vitest';

import { snapToGuides } from './snap-guides.js';

const other = { x: 100, y: 100, w: 208, h: 52 };

describe('snapToGuides', () => {
  it('центр по горизонтали в пределах порога — примагничивает и рисует горизонталь', () => {
    const r = snapToGuides({ x: 500, y: 104, w: 208, h: 52 }, [other], 6);
    expect(r.y).toBe(100);
    expect(r.x).toBe(500);
    expect(r.guides).toEqual([{ orientation: 'h', at: 100, from: 100, to: 708 }]);
  });

  it('разные размеры: центры совпадают (узел меньше выравнивается по центру)', () => {
    const r = snapToGuides({ x: 141, y: 300, w: 128, h: 28 }, [other], 6);
    expect(r.x + 64).toBe(204);
    expect(r.guides[0]).toMatchObject({ orientation: 'v', at: 204, from: 100, to: 328 });
  });

  it('дальше порога — без притяжения и линий', () => {
    const r = snapToGuides({ x: 500, y: 140, w: 208, h: 52 }, [other], 6);
    expect(r).toEqual({ x: 500, y: 140, guides: [] });
  });

  it('выбирает ближайшую линию из нескольких', () => {
    const r = snapToGuides(
      { x: 103, y: 400, w: 208, h: 52 },
      [other, { x: 105, y: 0, w: 208, h: 52 }],
      6,
    );
    expect(r.x).toBe(105);
  });
});
