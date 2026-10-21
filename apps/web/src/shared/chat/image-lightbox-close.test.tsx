// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MessageAttachment } from '@nodus/contracts';

import { ImageLightbox } from './image-lightbox.js';

/** Закрытие по заднику (#409): клик принадлежит лайтбоксу и НЕ всплывает
 *  в React-дерево до кликабельной карточки поста (портал живёт в body, но
 *  событие идёт по дереву компонентов) — иначе вместе с закрытием
 *  открывался тред. */

const image: MessageAttachment = {
  id: 'f1',
  fileId: '00000000-0000-4000-8000-000000000001',
  name: 'foto.png',
  size: 1000,
  mime: 'image/png',
  kind: 'image',
  url: '/demo/site-1.png',
  thumbnailUrl: '/demo/site-1.png',
  previewKind: 'image',
  pdfUrl: null,
  width: 1200,
  height: 800,
};

afterEach(cleanup);

describe('ImageLightbox — закрытие по заднику', () => {
  it('вызывает onClose ровно один раз и гасит всплытие', () => {
    const onClose = vi.fn();
    const ancestorClick = vi.fn();
    render(
      <div onClick={ancestorClick}>
        <ImageLightbox images={[image]} index={0} onIndex={vi.fn()} onClose={onClose} />
      </div>,
    );

    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    fireEvent.click(dialog);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(ancestorClick).not.toHaveBeenCalled();
  });
});
