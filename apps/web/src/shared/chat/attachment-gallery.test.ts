import { describe, expect, it } from 'vitest';
import type { MessageAttachment } from '@nodus/contracts';

import { galleryRows } from './attachment-gallery.js';

const img = (n: number): MessageAttachment => ({
  id: `img-${n}`,
  name: `фото-${n}.png`,
  size: 1000,
  mime: 'image/png',
  kind: 'image',
  url: `/demo/site-1.png`,
  thumbnailUrl: `/demo/site-1.png`,
  width: 1664,
  height: 928,
});

describe('galleryRows — раскладка галереи (plan chat-attachments-plan)', () => {
  it('пусто — без рядов', () => {
    expect(galleryRows([])).toEqual([]);
  });

  it('одно — крупная плитка одним рядом', () => {
    expect(galleryRows([img(1)])).toHaveLength(1);
    expect(galleryRows([img(1)])[0]).toHaveLength(1);
  });

  it('два и три — один ряд', () => {
    expect(galleryRows([img(1), img(2)])).toEqual([[img(1), img(2)]]);
    expect(galleryRows([img(1), img(2), img(3)])[0]).toHaveLength(3);
  });

  it('четыре и больше — ряды по три', () => {
    const rows = galleryRows([img(1), img(2), img(3), img(4)]);
    expect(rows.map((r) => r.length)).toEqual([3, 1]);
    const rows7 = galleryRows([1, 2, 3, 4, 5, 6, 7].map(img));
    expect(rows7.map((r) => r.length)).toEqual([3, 3, 1]);
  });
});
