import { describe, expect, it } from 'vitest';

import {
  isSideBySide,
  MIN_FEED_W,
  MIN_SIDE_BY_SIDE,
  MIN_THREAD_W,
  THREAD_MAX_W,
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
