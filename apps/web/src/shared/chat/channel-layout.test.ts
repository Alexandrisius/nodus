import { describe, expect, it } from 'vitest';
import { snapPx } from '@nodus/ui/components/node-edge';

import {
  flashFadeMs,
  isSideBySide,
  MIN_FEED_W,
  MIN_SIDE_BY_SIDE,
  MIN_THREAD_W,
  THREAD_MAX_W,
  THREAD_PORT_Y,
  threadLinkPoints,
  threadLinkSource,
  threadMaxW,
  threadScopeMessages,
  threadWidth,
} from './channel-layout.js';

describe('isSideBySide', () => {
  it('ниже порога — drill-down, на пороге и шире — две зоны', () => {
    expect(isSideBySide(MIN_SIDE_BY_SIDE - 1)).toBe(false);
    expect(isSideBySide(MIN_SIDE_BY_SIDE)).toBe(true);
  });
});

describe('threadWidth', () => {
  it('память пользователя, но лента не уже минимума', () => {
    expect(threadWidth(440, MIN_SIDE_BY_SIDE)).toBe(320);
    expect(threadWidth(440, 1200)).toBe(440);
    expect(threadWidth(900, 1200)).toBe(880);
  });
});

describe('threadLinkPoints', () => {
  it('ортогональная ломаная пост→порт: горизонталь-вертикаль-горизонталь, локоть в середине зазора; координаты снапнуты snapPx', () => {
    const points = threadLinkPoints({ x: 500, y: 300, pinned: null }, { left: 0, top: 0 }, 900);
    expect(points).toHaveLength(4);
    const [a, b, c, d] = points as [
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number },
    ];
    expect(a).toEqual({ x: snapPx(500), y: snapPx(300) });
    expect(b.y).toBe(a.y);
    expect(b.x).toBe(snapPx(Math.round((snapPx(500) + snapPx(900)) / 2)));
    expect(c.x).toBe(b.x);
    expect(c.y).toBe(snapPx(THREAD_PORT_Y));
    expect(d).toEqual({ x: snapPx(900), y: snapPx(THREAD_PORT_Y) });
  });

  it('pinned: линия оборвана на кромке — вертикаль от кромки до порта, без горизонтали к посту', () => {
    const points = threadLinkPoints({ x: 500, y: 100, pinned: 'top' }, { left: 0, top: 0 }, 900);
    expect(points).toHaveLength(3);
    expect(points[0]).toEqual({
      x: snapPx(Math.round((snapPx(500) + snapPx(900)) / 2)),
      y: snapPx(100),
    });
    expect(points[1]).toEqual({
      x: snapPx(Math.round((snapPx(500) + snapPx(900)) / 2)),
      y: snapPx(THREAD_PORT_Y),
    });
    expect(points[2]).toEqual({ x: snapPx(900), y: snapPx(THREAD_PORT_Y) });
  });

  it('координаты источника — локальные относительно контейнера', () => {
    const points = threadLinkPoints({ x: 700, y: 500, pinned: null }, { left: 200, top: 100 }, 900);
    expect(points[0]).toEqual({ x: snapPx(500), y: snapPx(400) });
  });

  it('регессия двойного вычета: при container.left ≠ 0 ПОСЛЕДНЯЯ точка — порт окна треда', () => {
    const container = { left: 560, top: 110 };
    const paneLeftAbs = 1500; // viewport-абсолютный левый край окна
    const points = threadLinkPoints({ x: 1097, y: 530, pinned: null }, container, paneLeftAbs);
    const last = points[points.length - 1];
    expect(last).toEqual({ x: snapPx(paneLeftAbs - container.left), y: snapPx(THREAD_PORT_Y) });
  });
});

describe('threadMaxW', () => {
  it('потолок THREAD_MAX_W держит тред от расползания на широком мониторе', () => {
    expect(threadMaxW(1940)).toBe(THREAD_MAX_W);
  });
  it('между потолком и полом — контейнер минус лента и перегородка', () => {
    expect(threadMaxW(900)).toBe(900 - MIN_FEED_W - 1);
  });
  it('пол — MIN_THREAD_W (вырожденный контейнер)', () => {
    expect(threadMaxW(400)).toBe(MIN_THREAD_W);
  });
});

describe('flashFadeMs', () => {
  it('длительности ограничены сверху: широкий монитор не теряет импульс', () => {
    expect(flashFadeMs(100_000)).toBe((0.35 + 0.9 + 0.6) * 1000);
  });

  it('короткий маршрут — длительности из скорости, длинный — больше короткого', () => {
    const short = flashFadeMs(120);
    expect(short).toBeLessThan(flashFadeMs(100_000));
    expect(short).toBeGreaterThan(0);
  });
});

describe('threadScopeMessages', () => {
  it('область «Этот тред» — корень и его ответы, чужие ветки мимо', () => {
    const items = [
      { id: 'r', threadRootId: null },
      { id: 'a', threadRootId: 'r' },
      { id: 'b', threadRootId: 'other' },
      { id: 'other', threadRootId: null },
    ];
    expect(threadScopeMessages(items, 'r').map((m) => m.id)).toEqual(['r', 'a']);
  });
});

describe('threadLinkSource', () => {
  const feed = { top: 100, bottom: 800 };
  it('пост видим целиком — порт на вертикальной середине поста, без pin', () => {
    expect(threadLinkSource({ top: 200, bottom: 400 }, feed)).toEqual({ y: 300, pinned: null });
  });
  it('любая часть поста за краем — pinned: линия оборвётся на кромке без точки', () => {
    expect(threadLinkSource({ top: -300, bottom: 150 }, feed)).toEqual({ y: 100, pinned: 'top' });
    expect(threadLinkSource({ top: 750, bottom: 1000 }, feed)).toEqual({
      y: 800,
      pinned: 'bottom',
    });
    expect(threadLinkSource({ top: -300, bottom: -100 }, feed)).toEqual({ y: 100, pinned: 'top' });
    expect(threadLinkSource({ top: 900, bottom: 1100 }, feed)).toEqual({
      y: 800,
      pinned: 'bottom',
    });
  });
});
