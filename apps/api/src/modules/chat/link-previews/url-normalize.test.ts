import { describe, expect, it } from 'vitest';

import { isSelfDomain, normalizeUrl, previewJobId, urlDomain } from './url-normalize.js';

/** Нормализация URL кэша превью (#212): стабильный ключ, срез трекеров. */

describe('normalizeUrl', () => {
  it('регистр схемы/хоста опускается, путь сохраняется', () => {
    expect(normalizeUrl('HTTPS://Example.COM/Path')).toBe('https://example.com/Path');
  });

  it('фрагмент срезается', () => {
    expect(normalizeUrl('https://example.com/a#section')).toBe('https://example.com/a');
  });

  it('utm_*/fbclid/gclid вырезаются, прочие параметры остаются', () => {
    expect(normalizeUrl('https://example.com/p?utm_source=x&id=2&fbclid=abc&gclid=z')).toBe(
      'https://example.com/p?id=2',
    );
  });

  it('порядок параметров сортируется — ключ стабилен', () => {
    expect(normalizeUrl('https://example.com/p?b=2&a=1')).toBe(
      normalizeUrl('https://example.com/p?a=1&b=2'),
    );
  });

  it('не-URL и не-http схемы — null', () => {
    expect(normalizeUrl('не адрес')).toBeNull();
    expect(normalizeUrl('ftp://example.com')).toBeNull();
  });
});

describe('urlDomain / isSelfDomain', () => {
  it('домен без www', () => {
    expect(urlDomain('https://www.nodus.by/x?y')).toBe('nodus.by');
  });

  it('self-домен и поддомены — true, чужие — false', () => {
    expect(isSelfDomain('https://nodus.by/x', ['nodus.by', 'localhost'])).toBe(true);
    expect(isSelfDomain('http://localhost:3000/x', ['nodus.by', 'localhost'])).toBe(true);
    expect(isSelfDomain('https://app.nodus.by/x', ['nodus.by'])).toBe(true);
    expect(isSelfDomain('https://evil-nodus.by/x', ['nodus.by'])).toBe(false);
    expect(isSelfDomain('https://example.com/nodus.by', ['nodus.by'])).toBe(false);
  });
});

describe('previewJobId', () => {
  it('без двоеточий (BullMQ запрещает в custom id), детерминирован', () => {
    const id = previewJobId('https://example.com/p?a=1');
    expect(id).not.toMatch(/:/);
    expect(id).toBe(previewJobId('https://example.com/p?a=1'));
    expect(id).not.toBe(previewJobId('https://example.com/p?a=2'));
  });
});
