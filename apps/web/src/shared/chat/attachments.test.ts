import { describe, expect, it } from 'vitest';
import type { MessageAttachment } from '@nodus/contracts';

import { attachmentsContentWidth, attachmentsLayout, CARD_LIST_W } from './attachments.js';
import { MEDIA_MAX_W } from './attachment-gallery.js';
import { uiPx } from '../ui/ui-scale.js';

const image = (n: number): MessageAttachment => ({
  id: `img-${n}`,
  fileId: `00000000-0000-4000-8000-00000000000${n}`,
  name: `фото-${n}.png`,
  size: 1000,
  mime: 'image/png',
  kind: 'image',
  url: '/demo/site-1.png',
  thumbnailUrl: '/demo/site-1.png',
  width: 1664,
  height: 928,
});

const file = (n: number): MessageAttachment => ({
  id: `file-${n}`,
  fileId: `10000000-0000-4000-8000-00000000000${n}`,
  name: `документ-${n}.pdf`,
  size: 2048,
  mime: 'application/pdf',
  kind: 'file',
  url: '/api/v1/files/x/content',
  thumbnailUrl: null,
  width: null,
  height: null,
});

describe('attachmentsLayout — режим показа вложений (#150, канон Telegram)', () => {
  it('одно изображение — одиночная плитка', () => {
    expect(attachmentsLayout([image(1)])).toEqual({ mode: 'single', image: image(1) });
  });

  it('только изображения 2+ — галерея, порядок сохранён', () => {
    const layout = attachmentsLayout([image(1), image(2), image(3)]);
    expect(layout.mode).toBe('gallery');
    if (layout.mode !== 'gallery') return;
    expect(layout.images.map((a) => a.id)).toEqual(['img-1', 'img-2', 'img-3']);
  });

  it('микс «фото+файл» — карточный список, галереи НЕТ, исходный порядок', () => {
    const layout = attachmentsLayout([image(1), file(2), image(3)]);
    expect(layout.mode).toBe('list');
    if (layout.mode !== 'list') return;
    expect(layout.items.map((a) => a.id)).toEqual(['img-1', 'file-2', 'img-3']);
  });

  it('только файлы — карточный список', () => {
    const layout = attachmentsLayout([file(1), file(2)]);
    expect(layout.mode).toBe('list');
    if (layout.mode !== 'list') return;
    expect(layout.items).toHaveLength(2);
  });

  it('пустой набор — список без элементов (вызывающий guards length>0)', () => {
    expect(attachmentsLayout([])).toEqual({ mode: 'list', items: [] });
  });
});

describe('attachmentsContentWidth — вложение задаёт ширину пузыря (#150)', () => {
  it('без вложений — null (пузырь w-fit от текста, как раньше)', () => {
    expect(attachmentsContentWidth([])).toBeNull();
  });

  it('карточный список (файлы/микс) — узкая ширина карточки, как в Битриксе', () => {
    expect(attachmentsContentWidth([file(1)])).toBe(CARD_LIST_W);
    expect(attachmentsContentWidth([image(1), file(2)])).toBe(CARD_LIST_W);
  });

  it('галерея — ширина бокса медиа', () => {
    expect(attachmentsContentWidth([image(1), image(2)])).toBe(MEDIA_MAX_W);
  });

  it('одиночная картинка — её бокс, но не уже пола колонки текста', () => {
    // крупная альбомная — бокс до капа; мелкая (100×100) — пол текста,
    // чтобы подпись не сжималась в иглу
    expect(attachmentsContentWidth([image(1)])).toBe(Math.round(uiPx(480)));
    const small = { ...image(1), width: 100, height: 100 };
    expect(attachmentsContentWidth([small])).toBe(Math.round(uiPx(240)));
  });
});
