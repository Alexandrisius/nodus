import { describe, expect, it } from 'vitest';

import { SignedUrlService } from './signed-url.service.js';

const ENV = { STORAGE_URL_SECRET: 'test-secret-32-chars-aaaaaaaaaaaa' };

describe('SignedUrlService (#57, ADR-0013)', () => {
  it('подпись проходит проверку и даёт относительный url того же origin', () => {
    const service = new SignedUrlService(ENV);
    const { exp, sig } = service.sign('file-1');
    expect(service.verify('file-1', exp, sig)).toBe(true);
    const url = service.fileContentUrl('file-1');
    expect(url).toMatch(/^\/api\/v1\/files\/file-1\/content\?exp=\d+&sig=[0-9a-f]{64}$/);
  });

  it('подпись другого ресурса не проходит (виза — на конкретный файл)', () => {
    const service = new SignedUrlService(ENV);
    const { exp, sig } = service.sign('file-1');
    expect(service.verify('file-2', exp, sig)).toBe(false);
  });

  it('истёкшая подпись не проходит', () => {
    const service = new SignedUrlService({
      ...ENV,
      STORAGE_URL_TTL_SECONDS: '60',
    });
    const { exp, sig } = service.sign('file-1');
    expect(service.verify('file-1', exp - 120, sig)).toBe(false);
    expect(service.verify('file-1', exp, sig)).toBe(true);
  });

  it('мусорная подпись отклоняется без исключений', () => {
    const service = new SignedUrlService(ENV);
    const { exp } = service.sign('file-1');
    expect(service.verify('file-1', exp, '')).toBe(false);
    expect(service.verify('file-1', exp, 'zz'.repeat(32))).toBe(false);
    expect(service.verify('file-1', Number.NaN, 'a'.repeat(64))).toBe(false);
  });

  it('секрет < 32 символов — понятная ошибка (fail-fast)', () => {
    expect(() => new SignedUrlService({ STORAGE_URL_SECRET: 'short' })).toThrow(
      /STORAGE_URL_SECRET/,
    );
  });

  it('бакет exp: повторные подписи того же ресурса идентичны (#150)', () => {
    const service = new SignedUrlService(ENV);
    // В пределах часового бакета URL стабилен — кэш браузера попадает.
    const urls = new Set(Array.from({ length: 5 }, () => service.fileContentUrl('file-1')));
    expect(urls.size).toBe(1);
  });

  it('бакет exp: граница часа меняет подпись, экспонента кратна бакету', () => {
    const service = new SignedUrlService(ENV);
    const { exp } = service.sign('file-1');
    expect(exp % 3_600).toBe(0);
    // Истинный ttl (60 с) меньше бакета — exp всё равно следующий бакет.
    const short = new SignedUrlService({ ...ENV, STORAGE_URL_TTL_SECONDS: '60' });
    const { exp: shortExp } = short.sign('file-1');
    expect(shortExp % 3_600).toBe(0);
    expect(shortExp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });
});
