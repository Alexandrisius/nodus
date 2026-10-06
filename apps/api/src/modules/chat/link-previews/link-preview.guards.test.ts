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

  it('литеральные приватные хосты — blocked (security-ревью: Node net.connect для литералов не зовёт lookup агента)', () => {
    for (const url of [
      'http://192.168.1.1/x',
      'http://10.0.0.1/x',
      'http://172.20.3.4/x',
      'http://127.0.0.1/x',
      'http://169.254.169.254/x',
      'http://[::1]/x',
      'http://[fe80::1]/x',
      'http://[fd00::1]/x',
      // v4-mapped в hex-форме (WHATWG URL так сериализует [::ffff:127.0.0.1]).
      'http://[::ffff:7f00:1]/x',
      'http://localhost/x',
    ]) {
      expect(() => assertFetchableUrl(url), url).toThrow(SsrfBlockedError);
    }
  });

  it('публичные литеральные и DNS-имена — проходят (DNS проверяет агент)', () => {
    expect(assertFetchableUrl('http://93.184.216.34/').hostname).toBe('93.184.216.34');
    expect(assertFetchableUrl('https://example.com/').hostname).toBe('example.com');
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
