// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import type { Sticker, StickerPack } from '@nodus/contracts';

import {
  STICKER_RECENT_MAX,
  pruneRecentStickers,
  pushRecentSticker,
  recentStickers,
  resolveRecentStickers,
  stickerToRecent,
} from './sticker-recent.js';

/** «Недавние стикеры» (#143, #409): дедуп по id, кап 12, битый localStorage
 *  не роняет чтение; localStorage хранит ТОЛЬКО идентичность — живой URL
 *  берётся из актуального ответа паков (подписанная ссылка истекает). */

const PACK = { id: 'p1', title: 'Nodus', scope: 'corporate' as const };

function sticker(n: number, url = `/stickers/demo/${n}.png`): Sticker {
  return {
    id: `s${n}`,
    packId: PACK.id,
    emojis: ['🔥'],
    url,
    mime: 'image/png',
    size: 1000,
    width: 512,
    height: 512,
  };
}

function pack(stickers: Sticker[]): StickerPack {
  return {
    id: PACK.id,
    title: PACK.title,
    scope: PACK.scope,
    owned: false,
    installed: false,
    stickers,
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

  it('мета пака переносится, URL НЕ сохраняется (#409)', () => {
    pushRecentSticker(sticker(7), PACK);
    const entry = recentStickers()[0]!;
    expect(entry).toMatchObject({
      packTitle: 'Nodus',
      packScope: 'corporate',
      emojis: ['🔥'],
    });
    expect(entry).not.toHaveProperty('url');
    expect(stickerToRecent(sticker(7), PACK)).toEqual(entry);
  });

  it('старая запись v1 с url читается; резолв берёт ЖИВОЙ url пака', () => {
    localStorage.setItem(
      'nodus-sticker-recent-v1',
      JSON.stringify([
        {
          id: 's7',
          packId: PACK.id,
          packTitle: 'Nodus',
          packScope: 'corporate',
          emojis: ['🔥'],
          url: '/api/v1/files/x/content?exp=1&sig=expired',
          mime: 'image/png',
          width: 512,
          height: 512,
        },
      ]),
    );

    const resolved = resolveRecentStickers(recentStickers(), [
      pack([sticker(7, '/api/v1/files/x/content?exp=2&sig=fresh')]),
    ]);

    expect(resolved[0]?.sticker.url).toBe('/api/v1/files/x/content?exp=2&sig=fresh');
  });

  it('резолв отбрасывает исчезнувшие стикеры; prune чистит хранилище', () => {
    pushRecentSticker(sticker(1), PACK);
    pushRecentSticker(sticker(2), PACK);

    const live = [pack([sticker(2)])];
    expect(resolveRecentStickers(recentStickers(), live).map((r) => r.entry.id)).toEqual(['s2']);

    pruneRecentStickers(new Set(['s2']));
    expect(recentStickers().map((r) => r.id)).toEqual(['s2']);
  });

  it('битый/чужой localStorage молча даёт пустой список', () => {
    localStorage.setItem('nodus-sticker-recent-v1', '{oops');
    expect(recentStickers()).toEqual([]);
    localStorage.setItem('nodus-sticker-recent-v1', JSON.stringify([42, null, { id: 'x' }]));
    expect(recentStickers()).toEqual([]);
  });
});
