/**
 * Правила файлов стикеров (#143, +JPEG #175): серверная валидация по magic
 * bytes — заявленному клиентом mime не верим (подделка расшифровки
 * Content-Type проходит наивный проход, байты — нет). Лимиты зеркалят
 * клиентские sticker-upload-rules.ts (WebP/PNG/JPEG ≤512КБ; WebM без звука
 * ≤256КБ; длительность — клиентская пре-валидация по metadata, ffprobe на
 * сервере нет — граница скоупа #143). JPEG — паритет с Битриксом (прозрачности
 * нет, фон остаётся прямоугольным — осознанный размен). Чистые функции —
 * детерминированные тесты.
 */

export const STICKER_STATIC_MAX_BYTES = 512 * 1024;
export const STICKER_WEBM_MAX_BYTES = 256 * 1024;

export type SniffedStickerType = 'png' | 'webp' | 'jpeg' | 'webm';

export type StickerFileIssue = 'format' | 'size';

/** Длина заголовков magic bytes (WebM-контейнер EBMC — 4 байта, WebP — 12,
 *  JPEG — 3: FF D8 FF, четвёртый байт — маркер сегмента, варьируется). */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBM_MAGIC = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

/** Определение формата по начальным байтам: PNG (8), WebP (RIFF….WEBP),
 *  WebM/Matroska (EBMC), JPEG (FFD8FF). null — не стикерный формат
 *  (GIF/SVG — отказ). */
export function sniffStickerType(head: Uint8Array): SniffedStickerType | null {
  if (
    head.length >= 12 &&
    head[0] === 0x52 &&
    head[1] === 0x49 &&
    head[2] === 0x46 &&
    head[3] === 0x46 &&
    head[8] === 0x57 &&
    head[9] === 0x45 &&
    head[10] === 0x42 &&
    head[11] === 0x50
  ) {
    return 'webp';
  }
  if (
    head.length >= PNG_MAGIC.length &&
    Buffer.compare(Buffer.from(head.subarray(0, PNG_MAGIC.length)), PNG_MAGIC) === 0
  ) {
    return 'png';
  }
  if (
    head.length >= JPEG_MAGIC.length &&
    Buffer.compare(Buffer.from(head.subarray(0, JPEG_MAGIC.length)), JPEG_MAGIC) === 0
  ) {
    return 'jpeg';
  }
  if (
    head.length >= WEBM_MAGIC.length &&
    Buffer.compare(Buffer.from(head.subarray(0, WEBM_MAGIC.length)), WEBM_MAGIC) === 0
  ) {
    return 'webm';
  }
  return null;
}

/** Полная проверка буфера: формат + лимит размера по типу. */
export function validateStickerBytes(bytes: Uint8Array): {
  type: SniffedStickerType;
  mime: string;
  issue: StickerFileIssue | null;
} {
  const type = sniffStickerType(bytes);
  if (!type) return { type: 'png', mime: '', issue: 'format' };
  const mime = type === 'webm' ? 'video/webm' : type === 'jpeg' ? 'image/jpeg' : `image/${type}`;
  const limit = type === 'webm' ? STICKER_WEBM_MAX_BYTES : STICKER_STATIC_MAX_BYTES;
  return { type, mime, issue: bytes.length > limit ? 'size' : null };
}
