import { describe, expect, it } from 'vitest';

import {
  detectEmojiStickerQuery,
  isEmojiCluster,
  normalizeEmojiKey,
  rankStickersByEmoji,
  type SuggestedSticker,
} from './composer-sticker-suggest.js';
import type { RecentSticker } from './sticker-recent.js';

/** Логика плашки стикеров-подсказок (#294): детект соло-эмодзи у конца
 *  поля, нормализация сравнения, ранжирование (недавние первыми). */

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function pack(id: string, scope: 'corporate' | 'personal', emojisPerSticker: string[][]) {
  return {
    id,
    title: `Пак ${id}`,
    scope,
    owned: scope === 'personal',
    installed: true,
    stickers: emojisPerSticker.map((emojis, i) => ({
      id: UUID(Number(id) * 100 + i),
      packId: id,
      emojis,
      url: `/s/${id}-${i}.png`,
      mime: 'image/png',
      size: 100,
      width: 512,
      height: 512,
    })),
  };
}

function recent(id: string, emojis: string[]): RecentSticker {
  return {
    id,
    packId: 'x',
    packTitle: 'x',
    packScope: 'corporate',
    emojis,
    url: `/s/${id}.png`,
    mime: 'image/png',
    width: null,
    height: null,
  };
}

describe('detectEmojiStickerQuery', () => {
  it('соло-эмодзи у конца поля — эмодзи', () => {
    expect(detectEmojiStickerQuery('🙂', 2)).toBe('🙂');
  });

  it('любой текст рядом (до/после), второй эмодзи, пробел — null', () => {
    expect(detectEmojiStickerQuery('привет 🙂', 9)).toBeNull();
    expect(detectEmojiStickerQuery('🙂 ', 3)).toBeNull();
    expect(detectEmojiStickerQuery(' 🙂', 3)).toBeNull();
    expect(detectEmojiStickerQuery('🙂🙂', 4)).toBeNull();
    expect(detectEmojiStickerQuery(':)', 2)).toBeNull();
    expect(detectEmojiStickerQuery('1', 1)).toBeNull();
    expect(detectEmojiStickerQuery('', 0)).toBeNull();
  });

  it('каретка не в конце (и выделение всего текста) — null', () => {
    expect(detectEmojiStickerQuery('🙂', 0)).toBeNull();
  });

  it('составные эмодзи — один кластер: ZWJ, скин-тон, флаг, keycap', () => {
    expect(detectEmojiStickerQuery('👨‍👩‍👦', 8)).toBe('👨‍👩‍👦');
    expect(detectEmojiStickerQuery('👍🏽', 4)).toBe('👍🏽');
    expect(detectEmojiStickerQuery('🇧🇾', 4)).toBe('🇧🇾');
    expect(detectEmojiStickerQuery('#️⃣', 3)).toBe('#️⃣');
  });
});

describe('isEmojiCluster / normalizeEmojiKey', () => {
  it('буквы/цифры — не эмодзи; keycap и флаг — эмодзи', () => {
    expect(isEmojiCluster('a')).toBe(false);
    expect(isEmojiCluster('1')).toBe(false);
    expect(isEmojiCluster('#')).toBe(false);
    expect(isEmojiCluster('#️⃣')).toBe(true);
    expect(isEmojiCluster('🇧🇾')).toBe(true);
  });

  it('нормализация: вариативные селекторы и скин-тоны не различаются', () => {
    expect(normalizeEmojiKey('☺️')).toBe(normalizeEmojiKey('☺'));
    expect(normalizeEmojiKey('👍🏽')).toBe(normalizeEmojiKey('👍'));
    // ZWJ-цепочка сохраняется целиком (семейные/профессии не слипаются).
    expect(normalizeEmojiKey('👨‍👩‍👦')).toBe('👨‍👩‍👦');
  });
});

describe('rankStickersByEmoji', () => {
  const corporate = pack('1', 'corporate', [['🙂'], ['🚀']]);
  const personal = pack('2', 'personal', [['🙂'], ['🚀'], ['🙂']]);

  it('точное совпадение (с нормализацией), корпоративные первыми', () => {
    const hits = rankStickersByEmoji([personal, corporate], [], '🙂');
    expect(hits.map((h) => h.sticker.id)).toEqual([
      corporate.stickers[0]!.id,
      personal.stickers[0]!.id,
      personal.stickers[2]!.id,
    ]);
  });

  it('недавние — первыми (в порядке recency), чужие недавние пропадают', () => {
    const hits = rankStickersByEmoji(
      [corporate, personal],
      [recent(personal.stickers[2]!.id, ['🙂']), recent(UUID(999), ['🙂'])],
      '🙂️', // вариативный селектор в запросе — не мешает
    );
    expect(hits.map((h) => h.sticker.id)).toEqual([
      personal.stickers[2]!.id,
      corporate.stickers[0]!.id,
      personal.stickers[0]!.id,
    ]);
  });

  it('дедуп и лимит плашки', () => {
    expect(rankStickersByEmoji([corporate, corporate], [], '🙂')).toHaveLength(1);
    const big = pack(
      '3',
      'corporate',
      Array.from({ length: 20 }, () => ['🔥']),
    );
    expect(rankStickersByEmoji([big], [], '🔥')).toHaveLength(16);
  });

  it('совпадение находится и по ZWJ-привязке стикера', () => {
    const family = pack('4', 'corporate', [['👨‍👩‍👦']]);
    const hits: SuggestedSticker[] = rankStickersByEmoji([family], [], '👨‍👩‍👦');
    expect(hits).toHaveLength(1);
  });
});
