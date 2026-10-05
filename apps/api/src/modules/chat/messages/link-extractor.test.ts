import { describe, expect, it } from 'vitest';

import { extractMessageUrls } from './link-extractor.js';

describe('extractMessageUrls', () => {
  it('извлекает единственный адрес', () => {
    expect(extractMessageUrls('Смотрите https://example.com/doc')).toEqual([
      'https://example.com/doc',
    ]);
  });

  it('извлекает несколько адресов в порядке появления', () => {
    expect(extractMessageUrls('Сначала http://a.dev/x, потом https://b.dev/y конец')).toEqual([
      'http://a.dev/x',
      'https://b.dev/y',
    ]);
  });

  it('срезает хвостовую пунктуацию предложения', () => {
    expect(extractMessageUrls('Читай https://example.com/a, пожалуйста.')).toEqual([
      'https://example.com/a',
    ]);
    expect(extractMessageUrls('(см. https://example.com/b)')).toEqual(['https://example.com/b']);
    expect(extractMessageUrls('ссылка "https://example.com/c"')).toEqual(['https://example.com/c']);
  });

  it('не трогает адрес с значимыми символами в середине', () => {
    expect(extractMessageUrls('https://example.com/a?x=1&y=2#frag')).toEqual([
      'https://example.com/a?x=1&y=2#frag',
    ]);
  });

  it('без адресов — пусто; bare-домены не извлекаются', () => {
    expect(extractMessageUrls('без ссылок')).toEqual([]);
    expect(extractMessageUrls('example.com без протокола')).toEqual([]);
  });

  it('дубликаты вхождения сохраняются (позиция уникальна)', () => {
    expect(extractMessageUrls('https://a.dev и https://a.dev')).toEqual([
      'https://a.dev',
      'https://a.dev',
    ]);
  });

  it('кап 50 ссылок на сообщение', () => {
    const text = Array.from({ length: 120 }, () => 'https://example.com').join(' ');
    expect(extractMessageUrls(text)).toHaveLength(50);
  });
});
