// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { isWebmFile, validateStickerFile } from './sticker-upload-rules.js';

/** Превалидация файлов стикеров (#143): формат/лимиты ДО трафика. Чистая
 *  функция — границы лимитов детерминированы. */

function file(name: string, type: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe('validateStickerFile (#143, +JPEG #175)', () => {
  it('WebP/PNG/JPEG в лимите — валидны', () => {
    expect(validateStickerFile(file('s.webp', 'image/webp', 512 * 1024))).toBeNull();
    expect(validateStickerFile(file('s.png', 'image/png', 512 * 1024))).toBeNull();
    expect(validateStickerFile(file('s.jpg', 'image/jpeg', 512 * 1024))).toBeNull();
    expect(validateStickerFile(file('s.jpeg', 'image/jpeg', 512 * 1024))).toBeNull();
  });

  it('статика выше 512КБ — size', () => {
    expect(validateStickerFile(file('s.webp', 'image/webp', 512 * 1024 + 1))).toBe('size');
  });

  it('WebM: свой лимит 256КБ; определяется по mime и по расширению', () => {
    expect(validateStickerFile(file('s.webm', 'video/webm', 256 * 1024))).toBeNull();
    expect(validateStickerFile(file('s.webm', 'video/webm', 256 * 1024 + 1))).toBe('size');
    // Присланный без mime (drag&drop) WebM узнаётся по расширению и не
    // отвергается как «не тот формат».
    const noMime = new File([new Uint8Array(10)], 's.WEBM', { type: '' });
    expect(isWebmFile(noMime)).toBe(true);
    expect(validateStickerFile(noMime)).toBeNull();
  });

  it('чужие форматы (GIF/SVG) — format', () => {
    expect(validateStickerFile(file('s.gif', 'image/gif', 100))).toBe('format');
    expect(validateStickerFile(file('s.svg', 'image/svg+xml', 100))).toBe('format');
  });
});
