import type { Sticker, StickerPack, StickerPackScope } from '@nodus/contracts';

/** «Недавние стикеры» (#143): последние отправленные — localStorage, канон
 *  недавних эмодзи (#130): клиентский, без сервера; кап 12 (Битрикс24).
 *  Храним ТОЛЬКО идентичность и мету (id/packId/эмодзи/mime/габариты):
 *  подписанный URL стикера живёт ≤24 ч и после перезагрузки/истечения давал
 *  битые картинки (#409). Живой URL и заголовок пака берутся из актуального
 *  ответа GET /chat/stickers/packs — см. resolveRecentStickers.
 *  Старые записи с полем url читаются по id (поле игнорируется). */

const RECENT_KEY = 'nodus-sticker-recent-v1';
export const STICKER_RECENT_MAX = 12;

export interface RecentSticker {
  id: string;
  packId: string;
  packTitle: string;
  packScope: StickerPackScope;
  emojis: string[];
  mime: string;
  width: number | null;
  height: number | null;
}

/** Недавний стикер, сверенный с актуальными паками: живой URL и свежие
 *  метаданные пака (переименование/удаление учитываются). */
export interface ResolvedRecentSticker {
  entry: RecentSticker;
  sticker: Sticker;
  pack: StickerPack;
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
        typeof (x as RecentSticker).mime === 'string',
    );
  } catch {
    return [];
  }
}

/** Сверка недавних с актуальными паками: URL и заголовок — ЖИВЫЕ (паки
 *  запрашиваются при открытии панели), удалённые стикеры/паки отбрасываются.
 *  Чистая функция — unit-тест (регрессия битых картинок #409). */
export function resolveRecentStickers(
  entries: readonly RecentSticker[],
  packs: readonly StickerPack[],
): ResolvedRecentSticker[] {
  const live = new Map<string, { sticker: Sticker; pack: StickerPack }>();
  for (const pack of packs) {
    for (const sticker of pack.stickers) live.set(sticker.id, { sticker, pack });
  }
  const resolved: ResolvedRecentSticker[] = [];
  for (const entry of entries) {
    const hit = live.get(entry.id);
    if (hit) resolved.push({ entry, sticker: hit.sticker, pack: hit.pack });
  }
  return resolved;
}

/** Убирает из localStorage записи, которых больше нет в паках (пак удалён /
 *  стикер убран) — иначе мёртвые id копятся до капа. */
export function pruneRecentStickers(aliveIds: ReadonlySet<string>): void {
  const current = recentStickers();
  const next = current.filter((entry) => aliveIds.has(entry.id));
  if (next.length === current.length) return;
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* localStorage недоступен — список отфильтруется при рендере */
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
