import { describe, expect, it } from 'vitest';

import { attachmentKindDelta, vaultKindOf } from './vault.repository.js';

/** Классификация витрины (ревизия 05.10): видео/аудио — файлы по mime,
 *  стикеры не считаются; Δ считается по составам ДО/ПОСЛЕ. */
describe('vaultKindOf', () => {
  it('image-kind → image; файлы — по префиксу mime', () => {
    expect(vaultKindOf('image/png', 'image')).toBe('image');
    expect(vaultKindOf('video/mp4', 'file')).toBe('video');
    expect(vaultKindOf('audio/x-m4a', 'file')).toBe('audio');
    expect(vaultKindOf('application/pdf', 'file')).toBe('document');
  });

  it('стикеры и посторонние виды — null (в витрине не считаются)', () => {
    expect(vaultKindOf('image/webp', 'sticker')).toBeNull();
    expect(vaultKindOf('application/octet-stream', 'unknown')).toBeNull();
  });
});

describe('attachmentKindDelta', () => {
  it('Δ по категориям ДО/ПОСЛЕ', () => {
    const before = [
      { kind: 'image', mime: 'image/png' },
      { kind: 'file', mime: 'video/mp4' },
      { kind: 'sticker', mime: 'image/webp' },
    ];
    const after = [
      { kind: 'file', mime: 'video/mp4' },
      { kind: 'file', mime: 'audio/x-m4a' },
      { kind: 'file', mime: 'application/pdf' },
      { kind: 'sticker', mime: 'image/webp' },
    ];
    expect(attachmentKindDelta(before, after)).toEqual({
      image: -1,
      video: 0,
      audio: 1,
      document: 1,
    });
  });
});
