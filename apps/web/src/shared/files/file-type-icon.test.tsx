// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FileTypeIcon } from './file-type-icon.js';

/**
 * FileTypeIcon (#144): ЕДИНАЯ точка маппинга mime → глиф + токен цвета типа
 * (pdf красный, офис синий, таблицы зелёные, архивы оранжевые, медиа
 * фиолетовые); формат без рода — нейтральный File без цветового токена.
 */

const colorOf = (mime: string): string => {
  const { container } = render(<FileTypeIcon mime={mime} />);
  return container.querySelector('svg')?.getAttribute('class') ?? '';
};

describe('FileTypeIcon', () => {
  afterEach(cleanup);

  it.each([
    ['application/pdf', 'text-file-pdf'],
    ['application/msword', 'text-file-doc'],
    ['text/csv', 'text-file-sheet'],
    ['application/zip', 'text-file-archive'],
    ['image/png', 'text-file-media'],
    ['audio/mpeg', 'text-file-media'],
    ['video/mp4', 'text-file-media'],
  ])('%s → %s', (mime, token) => {
    expect(colorOf(mime)).toContain(token);
  });

  it('формат без рода — нейтральный File', () => {
    expect(colorOf('text/plain')).toContain('text-muted-foreground');
  });
});
