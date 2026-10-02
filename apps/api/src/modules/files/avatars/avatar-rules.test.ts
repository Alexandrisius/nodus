import { describe, expect, it } from 'vitest';

import { AVATAR_MAX_BYTES, sniffAvatarType, validateAvatarBytes } from './avatar-rules.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const WEBP = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const GIF = Buffer.from('GIF89a');

describe('sniffAvatarType', () => {
  it('распознаёт PNG/JPEG/WebP по magic bytes', () => {
    expect(sniffAvatarType(PNG)).toBe('png');
    expect(sniffAvatarType(JPEG)).toBe('jpeg');
    expect(sniffAvatarType(WEBP)).toBe('webp');
  });

  it('GIF/SVG/мусор — не аватарный формат', () => {
    expect(sniffAvatarType(GIF)).toBeNull();
    expect(sniffAvatarType(Buffer.from('<svg/>'))).toBeNull();
    expect(sniffAvatarType(Buffer.alloc(4))).toBeNull();
  });
});

describe('validateAvatarBytes', () => {
  it('валидный PNG без issue, mime серверно-авторитетный', () => {
    const result = validateAvatarBytes(PNG);
    expect(result.issue).toBeNull();
    expect(result.mime).toBe('image/png');
  });

  it('превышение 2 МБ — issue size (клиентскому mime не верим)', () => {
    const big = Buffer.concat([PNG, Buffer.alloc(AVATAR_MAX_BYTES)]);
    expect(validateAvatarBytes(big).issue).toBe('size');
  });

  it('не-изображение — issue format', () => {
    expect(validateAvatarBytes(GIF).issue).toBe('format');
  });
});
