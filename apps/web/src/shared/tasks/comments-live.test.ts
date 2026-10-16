import { beforeEach, describe, expect, it } from 'vitest';

import { bumpCommentsOnce, displayedComments, useCommentsLive } from './comments-live.js';

const display = (id: string, base: number) =>
  displayedComments(useCommentsLive.getState(), { id, commentsCount: base });

describe('живой счётчик комментариев (#252)', () => {
  beforeEach(() => useCommentsLive.setState({ exact: {}, delta: {} }));

  it('+1 сразу по сообщению, повторная доставка не удваивает', () => {
    bumpCommentsOnce('t1', 'sent:m1', 1);
    bumpCommentsOnce('t1', 'sent:m1', 1);
    expect(display('t1', 3)).toBe(4);
  });

  it('точное значение сервера снимает дельту; следующее сообщение — от него', () => {
    bumpCommentsOnce('t2', 'sent:m2', 1);
    useCommentsLive.getState().setExact('t2', 10);
    expect(display('t2', 3)).toBe(10);
    bumpCommentsOnce('t2', 'sent:m3', 1);
    bumpCommentsOnce('t2', 'deleted:m3', -1);
    bumpCommentsOnce('t2', 'deleted:m3', -1);
    expect(display('t2', 3)).toBe(10);
  });
});
