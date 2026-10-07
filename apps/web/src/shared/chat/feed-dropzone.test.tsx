// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FeedDropzone } from './feed-dropzone.js';

/** Drop-зона ленты (#242): драг внутренних <img> (лента/превью) Chromium
 *  маскирует под файловый — синтезирует File из webp-миниатюры; такие драги
 *  несут text/html/uri-list в payload и должны отвергаться. Реальный файл из
 *  ОС несёт только Files. */
describe('FeedDropzone (#242)', () => {
  afterEach(cleanup);

  function renderZone(onFiles: (files: File[]) => void) {
    return render(
      <FeedDropzone onFiles={onFiles}>
        <div>лента</div>
      </FeedDropzone>,
    ).container.firstElementChild as HTMLElement;
  }

  it('дроп настоящего файла из ОС — прикрепляется', () => {
    const onFiles = vi.fn();
    const zone = renderZone(onFiles);
    const file = new File(['x'], 'отчёт.png', { type: 'image/png' });

    fireEvent.dragEnter(zone, { dataTransfer: { types: ['Files'], files: [file] } });
    fireEvent.drop(zone, { dataTransfer: { types: ['Files'], files: [file] } });

    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles.mock.calls[0]?.[0]).toHaveLength(1);
  });

  it('внутренний драг <img> (Files + text/html + uri-list) — отвергается', () => {
    const onFiles = vi.fn();
    const zone = renderZone(onFiles);
    // Chromium при драге картинки внутри страницы: синтезированный File
    // (webp-миниатюра) ПЛЮС html/uri представления.
    const fake = new File(['webp-bytes'], 'image.webp', { type: 'image/webp' });

    fireEvent.dragEnter(zone, {
      dataTransfer: { types: ['Files', 'text/html', 'text/uri-list'], files: [fake] },
    });
    fireEvent.drop(zone, {
      dataTransfer: { types: ['Files', 'text/html', 'text/uri-list'], files: [fake] },
    });

    expect(onFiles).not.toHaveBeenCalled();
  });

  it('драг без Files вовсе (текст/ссылка) — отвергается как раньше', () => {
    const onFiles = vi.fn();
    const zone = renderZone(onFiles);

    fireEvent.drop(zone, { dataTransfer: { types: ['text/plain', 'text/uri-list'], files: [] } });

    expect(onFiles).not.toHaveBeenCalled();
  });
});
