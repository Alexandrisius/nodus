import { describe, expect, it } from 'vitest';

import {
  STICKER_STATIC_MAX_BYTES,
  STICKER_WEBM_MAX_BYTES,
  sniffStickerType,
  validateStickerBytes,
} from './sticker-file-rules.js';

/** Валидный PNG-хедер минимальной длины. */
function png(bytes = 64): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(bytes),
  ]);
}

/** RIFF….WEBP (12 байт заголовка). */
function webp(bytes = 64): Buffer {
  return Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.alloc(4),
    Buffer.from('WEBP'),
    Buffer.alloc(bytes),
  ]);
}

/** EBMC-контейнер (1A 45 DF A3). */
function webm(bytes = 64): Buffer {
  return Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(bytes)]);
}

describe('sniffStickerType (magic bytes)', () => {
  it('распознаёт PNG, WebP, WebM по сигнатуре, не по заявленному mime', () => {
    expect(sniffStickerType(png())).toBe('png');
    expect(sniffStickerType(webp())).toBe('webp');
    expect(sniffStickerType(webm())).toBe('webm');
  });

  it('GIF/JPEG/SVG/пустой буфер — не стикерный формат', () => {
    expect(sniffStickerType(Buffer.from('GIF89a'))).toBeNull();
    expect(sniffStickerType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBeNull();
    expect(sniffStickerType(Buffer.from('<svg/>'))).toBeNull();
    expect(sniffStickerType(Buffer.alloc(0))).toBeNull();
  });

  it('RIFF без WEBP-тега — не WebP (AVI/WAV под видом)', () => {
    const avi = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('AVI ')]);
    expect(sniffStickerType(avi)).toBeNull();
  });

  it('короткий буфер — null (быстрая проверка без чтения остатка)', () => {
    expect(sniffStickerType(png(0).subarray(0, 4))).toBeNull();
  });
});

describe('validateStickerBytes (формат + лимиты)', () => {
  it('валидная статика ≤512КБ проходит, mime выводится из байтов', () => {
    const verdict = validateStickerBytes(png());
    expect(verdict).toMatchObject({ type: 'png', mime: 'image/png', issue: null });
    expect(validateStickerBytes(webp()).mime).toBe('image/webp');
  });

  it('статика больше 512КБ — issue size', () => {
    const big = Buffer.concat([png(0), Buffer.alloc(STICKER_STATIC_MAX_BYTES + 1)]);
    expect(validateStickerBytes(big).issue).toBe('size');
  });

  it('WebM: лимит 256КБ (строже статики)', () => {
    expect(validateStickerBytes(webm()).issue).toBeNull();
    expect(validateStickerBytes(webm()).mime).toBe('video/webm');
    const big = Buffer.concat([webm(0), Buffer.alloc(STICKER_WEBM_MAX_BYTES + 1)]);
    expect(validateStickerBytes(big).issue).toBe('size');
  });

  it('WebM больше 256КБ, но меньше 512КБ — всё равно отказ (лимит по типу)', () => {
    const between = Buffer.concat([webm(0), Buffer.alloc(STICKER_WEBM_MAX_BYTES + 1024)]);
    expect(between.length).toBeLessThan(STICKER_STATIC_MAX_BYTES);
    expect(validateStickerBytes(between).issue).toBe('size');
  });

  it('подделка: PNG-сигнатура нет, а байты от JPEG — issue format', () => {
    const fake = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), png(0).subarray(3)]);
    expect(validateStickerBytes(fake).issue).toBe('format');
  });
});
