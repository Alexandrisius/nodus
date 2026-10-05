import { describe, expect, it } from 'vitest';

import { assertFetchableUrl, clampField, SsrfBlockedError } from './link-preview.guards.js';

/** SSRF-гварды превью (#212): чистые проверки — порты/схема/креды/лимиты. */

describe('assertFetchableUrl', () => {
  it('http/https без порта и с 80/443 — проходят (дефолтные порты URL нормализует в "")', () => {
    expect(assertFetchableUrl('https://example.com/a').hostname).toBe('example.com');
    expect(assertFetchableUrl('http://example.com:80/a').port).toBe('');
    expect(assertFetchableUrl('https://example.com:443/a').port).toBe('');
  });

  it('произвольные порты (8080/3000/9200) — blocked', () => {
    expect(() => assertFetchableUrl('http://example.com:8080/')).toThrow(SsrfBlockedError);
    expect(() => assertFetchableUrl('http://127.0.0.1:3000/')).toThrow(SsrfBlockedError);
  });

  it('не-http схемы — blocked', () => {
    expect(() => assertFetchableUrl('file:///etc/passwd')).toThrow(SsrfBlockedError);
    expect(() => assertFetchableUrl('ftp://example.com')).toThrow(SsrfBlockedError);
  });

  it('креды в URL — blocked', () => {
    expect(() => assertFetchableUrl('https://user:pass@example.com/')).toThrow(SsrfBlockedError);
  });

  it('мусор — blocked', () => {
    expect(() => assertFetchableUrl('не адрес')).toThrow(SsrfBlockedError);
  });
});

describe('clampField', () => {
  it('нормальный текст проходит, пробелы схлопываются', () => {
    expect(clampField('  Заголовок   сайта ', 300)).toBe('Заголовок сайта');
  });

  it('пустое/пробельное — null', () => {
    expect(clampField('', 10)).toBeNull();
    expect(clampField('   ', 10)).toBeNull();
    expect(clampField(null, 10)).toBeNull();
  });

  it('длинное — обрезается с многоточием', () => {
    const out = clampField('а'.repeat(500), 300);
    expect(out!.length).toBe(300);
    expect(out!.endsWith('…')).toBe(true);
  });
});
