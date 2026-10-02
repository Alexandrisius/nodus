import { describe, expect, it } from 'vitest';

import { AVATAR_MAX_BYTES, validateAvatarFile } from './avatar-upload.js';

function file(type: string, size: number): File {
  return new File([new Uint8Array(size)], 'photo', { type });
}

describe('validateAvatarFile (#186): превалидация до старта загрузки', () => {
  it('PNG/JPEG/WebP до 10 МБ проходят', () => {
    expect(validateAvatarFile(file('image/png', 1024))).toBeNull();
    expect(validateAvatarFile(file('image/jpeg', 1024))).toBeNull();
    expect(validateAvatarFile(file('image/webp', 1024))).toBeNull();
  });

  it('не-изображение и прочие форматы — отказ до трафика', () => {
    expect(validateAvatarFile(file('application/pdf', 1024))).toBe('not-image');
    expect(validateAvatarFile(file('image/gif', 1024))).toBe('bad-format');
    expect(validateAvatarFile(file('image/svg+xml', 1024))).toBe('bad-format');
  });

  it('больше 10 МБ — too-large', () => {
    expect(validateAvatarFile(file('image/png', AVATAR_MAX_BYTES + 1))).toBe('too-large');
  });
});
