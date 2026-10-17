import { stripMentionTokens, truncateMentionText } from '@nodus/contracts';

import type { ReplySnapshotValue } from './message-reply-preview.js';

/** Усечение сниппета цитаты и частичной цитаты (мок: REPLY_SNIPPET_MAX = 160). */
export const REPLY_SNIPPET_MAX = 160;

export interface ReplyOriginalInput {
  authorId: string;
  text: string;
  deleted: boolean;
  /** Вид первого вложения — подпись «Фото»/«Файл»/«Стикер» в цитате без текста. */
  attachmentKind: 'image' | 'file' | 'sticker' | null;
  /** #288: оригинал-стикер — fileId для мини-глифа в цитате (url строится
   *  ПОДПИСЬЮ при чтении: замороженный снапшот не хранит протухающие ссылки)
   *  и первый эмодзи пака. */
  stickerFileId: string | null;
  stickerEmoji: string | null;
  stickerMime: string | null;
}

/** Отображаемый текст для сверки цитаты: токены упоминаний → подписи чипов
 *  (как в пузыре и в выделении браузера), пробельные серии → один пробел. */
function displayText(text: string): string {
  return stripMentionTokens(text).replace(/\s+/g, ' ').trim();
}

/**
 * Частичная цитата — фрагмент ОТОБРАЖАЕМОГО текста оригинала (#346, модель
 * Telegram Replies 2.0): клиент присылает выделение из пузыря. Иначе автор
 * ответа мог бы приписать коллеге слова, которых тот не писал.
 */
export function isQuoteOf(originalText: string, quoteText: string): boolean {
  const quote = displayText(quoteText);
  return quote.length > 0 && displayText(originalText).includes(quote);
}

/**
 * Снапшот цитаты строит СЕРВЕР в момент отправки (мок-семантика):
 * текст и частичная цитата усекаются до REPLY_SNIPPET_MAX, вложение —
 * только вид (не содержимое). Удалённый/несуществующий оригинал:
 * authorId сохраняется, если оригинал был надгробием (строка жива),
 * null — если оригинала нет; text/quote/attachmentKind затираются.
 * Снапшот заморожен навсегда; deleted-флаг вычисляет маппер по строке.
 * Частичная цитата, которой нет в тексте оригинала, отбрасывается (#346):
 * ответ становится цитатой всего сообщения — легитимный клиент не
 * промахивается, расхождение рендера не ломает отправку.
 */
export function buildReplySnapshot(
  original: ReplyOriginalInput | null,
  quoteText: string | null | undefined,
): ReplySnapshotValue {
  if (!original || original.deleted) {
    return {
      authorId: original?.authorId ?? null,
      text: '',
      quoteText: null,
      attachmentKind: null,
      stickerFileId: null,
      stickerEmoji: null,
      stickerMime: null,
    };
  }
  // Токен-знающая обрезка (#224): срез по границам сегментов — замороженный
  // снапшот никогда не хранит огрызок `@[Имя](user:…` (цитата без кода).
  return {
    authorId: original.authorId,
    text: truncateMentionText(original.text, REPLY_SNIPPET_MAX),
    quoteText:
      quoteText && isQuoteOf(original.text, quoteText)
        ? truncateMentionText(quoteText, REPLY_SNIPPET_MAX)
        : null,
    attachmentKind: original.attachmentKind,
    stickerFileId: original.stickerFileId,
    stickerEmoji: original.stickerEmoji,
    stickerMime: original.stickerMime,
  };
}
