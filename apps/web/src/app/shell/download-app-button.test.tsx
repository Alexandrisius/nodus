// @vitest-environment jsdom
import {
  QueryClient,
  QueryClientProvider,
  type QueryClientProviderProps,
} from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DownloadAppButton } from './download-app-button.js';

/**
 * Кнопка «Скачать приложение» (#263): без раздачи /desktop/ кнопки нет;
 * браузеру — прямая загрузка NSIS-установщика; в оболочке при готовом
 * обновлении — «Обновить приложение» с зелёной точкой.
 */

const MANIFEST = {
  version: '1.0.1',
  notes: 'Кнопка скачивания',
  pub_date: '2026-10-09T11:18:25.537Z',
  platforms: {
    'windows-x86_64-nsis': { url: 'http://127.0.0.1:4173/desktop/Nodus_1.0.1_x64-setup.exe' },
    'windows-x86_64': { url: 'http://127.0.0.1:4173/desktop/Nodus_1.0.1_x64-setup.exe' },
  },
};

function stubFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

function installShellBridge(state: { status: string; version: string | null }) {
  const listeners = new Map<string, ((payload: unknown) => void)[]>();
  window.nodusDesktop = {
    shellVersion: '1.0.0',
    platform: 'windows',
    getShellInfo: vi.fn(async () => ({ version: '1.0.0', platform: 'windows' })),
    getUpdateState: vi.fn(async () => state),
    applyUpdate: vi.fn(async () => undefined),
    onEvent: vi.fn((type: string, fn: (payload: unknown) => void) => {
      const arr = listeners.get(type) ?? [];
      arr.push(fn);
      listeners.set(type, arr);
      return () => undefined;
    }),
  } as unknown as typeof window.nodusDesktop;
  return listeners;
}

function renderButton() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      QueryClientProvider,
      { client } satisfies QueryClientProviderProps,
      createElement(DownloadAppButton) as ReactNode,
    ),
  );
}

beforeEach(() => {
  delete window.nodusDesktop;
});

afterEach(() => {
  delete window.nodusDesktop;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('браузер', () => {
  it('нет манифеста — кнопки нет (fail-safe)', async () => {
    vi.stubGlobal('fetch', stubFetch(404, {}));
    renderButton();
    await waitFor(() => expect(screen.queryByRole('button')).toBeNull());
  });

  it('манифест есть — кнопка ведёт на NSIS-установщик', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).endsWith('changelog.json')
          ? new Response('[]', { status: 404 })
          : new Response(JSON.stringify(MANIFEST), { status: 200 }),
      ),
    );
    renderButton();
    const link = await screen.findByRole('link', { name: 'Скачать приложение' });
    expect(link.getAttribute('href')).toBe(MANIFEST.platforms['windows-x86_64-nsis'].url);
    expect(screen.queryByText('bg-success')).toBeNull();
  });
});

describe('оболочка', () => {
  it('обновление скачано — точка + «Обновить приложение»', async () => {
    installShellBridge({ status: 'available', version: '1.0.1' });
    vi.stubGlobal('fetch', stubFetch(200, MANIFEST));
    renderButton();
    const button = await screen.findByRole('button', { name: 'Обновить приложение' });
    expect(button.querySelector('.bg-success')).not.toBeNull();
  });

  it('обновления нет — без точки, подпись «Скачать приложение»', async () => {
    installShellBridge({ status: 'idle', version: null });
    vi.stubGlobal('fetch', stubFetch(200, MANIFEST));
    renderButton();
    const button = await screen.findByRole('button', { name: 'Скачать приложение' });
    expect(button.querySelector('.bg-success')).toBeNull();
  });
});
