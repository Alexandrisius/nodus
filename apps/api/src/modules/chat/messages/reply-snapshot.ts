import type { ReplySnapshotValue } from './message-dto.mapper.js';

/** Усечение сниппета цитаты и частичной цитаты (мок: REPLY_SNIPPET_MAX = 160). */
export const REPLY_SNIPPET_MAX = 160;

export interface ReplyOriginalInput {
  authorId: string;
  text: string;
  deleted: boolean;
  /** Вид первого вложения — подпись «Фото»/«Файл» в цитате без текста. */
  attachmentKind: 'image' | 'file' | null;
}

/**
 * Снапшот цитаты строит СЕРВЕР в момент отправки (мок-семантика):
 * текст и частичная цитата усекаются до REPLY_SNIPPET_MAX, вложение —
 * только вид (не содержимое). Удалённый/несуществующий оригинал:
 * authorId сохраняется, если оригинал был надгробием (строка жива),
 * null — если оригинала нет; text/quote/attachmentKind затираются.
 * Снапшот заморожен навсегда; deleted-флаг вычисляет маппер по строке.
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
    };
  }
  return {
    authorId: original.authorId,
    text: original.text.slice(0, REPLY_SNIPPET_MAX),
    quoteText: quoteText ? quoteText.slice(0, REPLY_SNIPPET_MAX) : null,
    attachmentKind: original.attachmentKind,
  };
}
