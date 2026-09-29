// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OFFICE_WARM_URLS, warmOfficeAssets } from './office-warmup.js';

function flushIdle(delayMs: number) {
  return new Promise((resolve) => setTimeout(resolve, delayMs + 30));
}

describe('office-warmup (#138)', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('после idle-паузы качает тяжёлые ассеты DS и ставит флаг', async () => {
    const fetchMock = vi.fn(async () => new Response('js', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    warmOfficeAssets(10);
    await flushIdle(10);
    expect(fetchMock).toHaveBeenCalledTimes(OFFICE_WARM_URLS.length);
    for (const url of OFFICE_WARM_URLS) {
      expect(fetchMock).toHaveBeenCalledWith(url, { cache: 'default' });
    }
    expect(localStorage.getItem('nodus-office-warm-v1')).toBe('1');
  });

  it('при установленном флаге не качает повторно', async () => {
    localStorage.setItem('nodus-office-warm-v1', '1');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    warmOfficeAssets(10);
    await flushIdle(10);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('сбой загрузки — флаг не ставится (повтор в следующей сессии)', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('offline');
    });
    vi.stubGlobal('fetch', fetchMock);
    warmOfficeAssets(10);
    await flushIdle(10);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('nodus-office-warm-v1')).toBeNull();
  });
});
