// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  desktopManifestSchema,
  fetchDesktopManifest,
  windowsInstallerUrl,
} from './desktop-manifest.js';

/**
 * Манифест раздачи /desktop/latest.json (#263): nginx абсолютизирует url на
 * раздаче — относительный путь в манифесте означает сломанную цепочку и
 * отбрасывается на границе.
 */

const MANIFEST = {
  version: '1.0.1',
  notes: 'Кнопка скачивания',
  pub_date: '2026-10-09T11:18:25.537Z',
  platforms: {
    'windows-x86_64-nsis': { url: 'https://nodus.by/desktop/Nodus_1.0.1_x64-setup.exe' },
    'windows-x86_64-msi': { url: 'https://nodus.by/desktop/Nodus_1.0.1_x64_ru-RU.msi' },
    'windows-x86_64': { url: 'https://nodus.by/desktop/Nodus_1.0.1_x64-setup.exe' },
  },
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('desktopManifestSchema', () => {
  it('принимает валидный манифест с абсолютными url', () => {
    expect(desktopManifestSchema.safeParse(MANIFEST).success).toBe(true);
  });

  it('отвергает относительный url (sub_filter не отработал/файл кривой)', () => {
    const parsed = desktopManifestSchema.safeParse({
      ...MANIFEST,
      platforms: { 'windows-x86_64': { url: '/desktop/Nodus_1.0.1_x64-setup.exe' } },
    });
    expect(parsed.success).toBe(false);
  });

  it('отвергает javascript:/data: url в манифесте (security #263)', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,hi']) {
      const parsed = desktopManifestSchema.safeParse({
        ...MANIFEST,
        platforms: { 'windows-x86_64': { url } },
      });
      expect(parsed.success).toBe(false);
    }
  });
});

describe('windowsInstallerUrl', () => {
  it('приоритет — NSIS-канал, затем общий ключ', () => {
    const manifest = desktopManifestSchema.parse(MANIFEST);
    expect(windowsInstallerUrl(manifest)).toBe(MANIFEST.platforms['windows-x86_64-nsis'].url);

    const fallback = desktopManifestSchema.parse({
      version: '1.0.1',
      platforms: { 'windows-x86_64': { url: 'https://n/d.exe' } },
    });
    expect(windowsInstallerUrl(fallback)).toBe('https://n/d.exe');
  });

  it('нет Windows-канала — null (кнопка не показывается)', () => {
    const manifest = desktopManifestSchema.parse({
      version: '1.0.1',
      platforms: { 'darwin-aarch64': { url: 'https://n/dmg' } },
    });
    expect(windowsInstallerUrl(manifest)).toBeNull();
  });
});

describe('fetch-границы', () => {
  it('404 и мусор — null, а не ошибка (нет раздачи — нет кнопки)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(404, {})),
    );
    expect(await fetchDesktopManifest()).toBeNull();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, { version: 42 })),
    );
    expect(await fetchDesktopManifest()).toBeNull();
  });

  it('сетевой сбой — null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('offline'))),
    );
    expect(await fetchDesktopManifest()).toBeNull();
  });
});
