import type { Sticker, StickerPack } from '@nodus/contracts';

import type { RecentSticker } from './sticker-recent.js';

/**
 * Стикеры-подсказки при вводе соло-эмодзи (#294, канон Telegram): в поле
 * ровно один эмодзи — над строкой ввода плашка со стикерами, помеченными
 * этим эмодзи (привязки Sticker.emojis #143 — их заявленная «фаза 2»).
 * Всё чистыми функциями — unit-тесты без React; клавиатура и данные — в
 * хуке панели (composer-sticker-suggest-panel.tsx).
 *
 * Триггер — ВСЁ поле целиком (модель Telegram Desktop, SuggestionsController):
 * любой другой символ или второй эмодзи закрывают подсказку (требование
 * владельца #294: «соло смайлик — панель раскрыта, два — скрыта»). Сравнение
 * эмодзи — с нормализацией: вариативные селекторы и скин-тоны не различаются
 * (стикер с «👍» находится и по «👍🏽»), ZWJ-последовательности — целиком.
 */

/** Лимит плашки: один ряд с горизонтальным скроллом (канон пикеров). */
export const STICKER_SUGGEST_MAX = 16;

const KEYCAP = /^[#*0-9]\uFE0F?\u20E3$/u;
const FLAGS = /^\p{Regional_Indicator}{2}$/u;

/** Один графем-кластер — эмодзи: пиктографика, keycap (#️⃣) или флаг из пары
 *  региональных индикаторов. Цифры/буквы — нет (\p{Emoji} матчит и «1»). */
export function isEmojiCluster(cluster: string): boolean {
  if (KEYCAP.test(cluster) || FLAGS.test(cluster)) return true;
  return /\p{Extended_Pictographic}/u.test(cluster);
}

/** Разбиение на графем-кластеры: Intl.Segmenter (базлайн 2022, WebView2
 *  ок). Фолбэк — посимвольно по кодовым точкам: подсказка на древних
 *  движках срабатывает реже (ZWJ-цепочки не соберутся), не ломается. */
function graphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return [...segmenter.segment(text)].map((s) => s.segment);
  }
  return [...text];
}

/** Соло-эмодзи у конца поля: текст = ровно один эмодзи-кластер, каретка в
 *  конце. Иначе null. Каретка — selectionStart поля: выделение всего текста
 *  даёт 0 ≠ length → подсказки нет (модель Telegram Desktop). */
export function detectEmojiStickerQuery(text: string, caret: number): string | null {
  if (text.length === 0 || caret !== text.length) return null;
  const clusters = graphemes(text);
  if (clusters.length !== 1) return null;
  const only = clusters[0]!;
  return isEmojiCluster(only) ? only : null;
}

/** Ключ сравнения эмодзи: без вариативных селекторов (U+FE0E/FE0F) и
 *  скин-тонов (U+1F3FB–1F3FF); ZWJ-последовательности сохраняются. */
export function normalizeEmojiKey(emoji: string): string {
  return emoji.replace(/[\uFE0E\uFE0F]/gu, '').replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '');
}

export interface SuggestedSticker {
  sticker: Sticker;
  pack: StickerPack;
}

/** Совпадения по эмодзи: недавно отправленные — первыми (порядок recency,
 *  канон Telegram), далее по пакам — корпоративные первыми, стикеры в
 *  порядке пака; дедуп по id, лимит плашки. Недавние с удалённым/чужим
 *  паком не предлагаются — отправка упала бы 403 (гейт доступа к паку). */
export function rankStickersByEmoji(
  packs: StickerPack[],
  recents: RecentSticker[],
  emoji: string,
): SuggestedSticker[] {
  const corporate = packs.filter((p) => p.scope === 'corporate');
  const personal = packs.filter((p) => p.scope !== 'corporate');
  const key = normalizeEmojiKey(emoji);
  const matches = new Map<string, SuggestedSticker>();
  for (const pack of [...corporate, ...personal]) {
    for (const sticker of pack.stickers) {
      if (!sticker.emojis.some((e) => normalizeEmojiKey(e) === key)) continue;
      if (!matches.has(sticker.id)) matches.set(sticker.id, { sticker, pack });
    }
  }
  const result: SuggestedSticker[] = [];
  for (const recent of recents) {
    const hit = matches.get(recent.id);
    if (hit) {
      result.push(hit);
      matches.delete(recent.id);
    }
  }
  result.push(...matches.values());
  return result.slice(0, STICKER_SUGGEST_MAX);
}
