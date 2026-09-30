import type { Sticker, StickerPackScope } from '@nodus/contracts';

/** «Недавние стикеры» (#143): последние отправленные — localStorage, канон
 *  недавних эмодзи (#130): клиентский, без сервера; кап 12 (Битрикс24).
 *  Храним рендер- и отправку-минимум (включая мету пака) — «Недавние»
 *  рисуются и отправляются без запросов. */

const RECENT_KEY = 'nodus-sticker-recent-v1';
export const STICKER_RECENT_MAX = 12;

export interface RecentSticker {
  id: string;
  packId: string;
  packTitle: string;
  packScope: StickerPackScope;
  emojis: string[];
  url: string;
  mime: string;
  width: number | null;
  height: number | null;
}

export function stickerToRecent(
  sticker: Sticker,
  pack: { id: string; title: string; scope: StickerPackScope },
): RecentSticker {
  return {
    id: sticker.id,
    packId: pack.id,
    packTitle: pack.title,
    packScope: pack.scope,
    emojis: sticker.emojis,
    url: sticker.url,
    mime: sticker.mime,
    width: sticker.width,
    height: sticker.height,
  };
}

export function recentStickers(): RecentSticker[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (x): x is RecentSticker =>
        typeof x === 'object' &&
        x !== null &&
        typeof (x as RecentSticker).id === 'string' &&
        typeof (x as RecentSticker).packId === 'string' &&
        typeof (x as RecentSticker).url === 'string' &&
        typeof (x as RecentSticker).mime === 'string',
    );
  } catch {
    return [];
  }
}

export function pushRecentSticker(
  sticker: Sticker,
  pack: { id: string; title: string; scope: StickerPackScope },
): void {
  const entry = stickerToRecent(sticker, pack);
  const next = [entry, ...recentStickers().filter((x) => x.id !== entry.id)].slice(
    0,
    STICKER_RECENT_MAX,
  );
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}
