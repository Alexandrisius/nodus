// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import type { Sticker } from '@nodus/contracts';

import {
  STICKER_RECENT_MAX,
  pushRecentSticker,
  recentStickers,
  stickerToRecent,
} from './sticker-recent.js';

/** «Недавние стикеры» (#143): дедуп по id, кап 12, битый localStorage не
 *  роняет чтение, мета пака переносится целиком (отправка без запросов). */

const PACK = { id: 'p1', title: 'Nodus', scope: 'corporate' as const };

function sticker(n: number): Sticker {
  return {
    id: `s${n}`,
    packId: PACK.id,
    emojis: ['🔥'],
    url: `/stickers/demo/${n}.png`,
    mime: 'image/png',
    size: 1000,
    width: 512,
    height: 512,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('sticker-recent (#143)', () => {
  it('pushRecentSticker: дедуп и порядок «свежий сверху»', () => {
    pushRecentSticker(sticker(1), PACK);
    pushRecentSticker(sticker(2), PACK);
    pushRecentSticker(sticker(1), PACK);
    expect(recentStickers().map((r) => r.id)).toEqual(['s1', 's2']);
  });

  it('кап 12 (Битрикс24): старейшие вытесняются', () => {
    for (let n = 0; n < STICKER_RECENT_MAX + 5; n += 1) {
      pushRecentSticker(sticker(n), PACK);
    }
    const list = recentStickers();
    expect(list).toHaveLength(STICKER_RECENT_MAX);
    expect(list[0]?.id).toBe(`s${STICKER_RECENT_MAX + 4}`);
    expect(list.at(-1)?.id).toBe('s5');
  });

  it('мета пака переносится: недавние отправляются без lookup', () => {
    pushRecentSticker(sticker(7), PACK);
    const entry = recentStickers()[0]!;
    expect(entry).toMatchObject({
      packTitle: 'Nodus',
      packScope: 'corporate',
      emojis: ['🔥'],
      url: '/stickers/demo/7.png',
    });
    expect(stickerToRecent(sticker(7), PACK)).toEqual(entry);
  });

  it('битый/чужой localStorage молча даёт пустой список', () => {
    localStorage.setItem('nodus-sticker-recent-v1', '{oops');
    expect(recentStickers()).toEqual([]);
    localStorage.setItem('nodus-sticker-recent-v1', JSON.stringify([42, null, { id: 'x' }]));
    expect(recentStickers()).toEqual([]);
  });
});
