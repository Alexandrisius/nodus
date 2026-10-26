// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ui } from '@nodus/contracts';

import { useMessageToTask } from './conversation-actions.js';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const MESSAGE_ID = '60000000-0000-4000-8000-000000000001';

function wrapper({ children }: { children: ReactNode }) {
  return createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
    children,
  );
}

async function sentBody(text: string): Promise<Record<string, unknown>> {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
    async (input) => {
      // Библиотека типов пуста: быстрый вход создаёт задачу сразу (#432).
      if (String(input).includes('/workflows/types')) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ id: 't1' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    },
  );
  vi.stubGlobal('fetch', fetchMock);
  const { result } = renderHook(() => useMessageToTask(), { wrapper });
  await act(async () => {
    result.current({ id: MESSAGE_ID, text });
  });
  const call = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/tasks'));
  expect(call).toBeTruthy();
  const [input, init] = call!;
  expect(String(input)).toMatch(/\/tasks$/);
  expect(init?.method).toBe('POST');
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

describe('useMessageToTask (#252): «В задачу» — быстрый вход единого окна', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('название — первая строка, описание — весь текст, происхождение — id сообщения', async () => {
    const body = await sentBody('Проверить узел\nподробности ниже');
    expect(body).toEqual({
      title: 'Проверить узел',
      description: 'Проверить узел\nподробности ниже',
      sourceMessageId: MESSAGE_ID,
    });
  });

  it('сообщение без текста (только вложения) — название-заглушка без описания', async () => {
    const body = await sentBody('');
    expect(body).toEqual({ title: ui.chat.toTaskUntitled, sourceMessageId: MESSAGE_ID });
  });
});
