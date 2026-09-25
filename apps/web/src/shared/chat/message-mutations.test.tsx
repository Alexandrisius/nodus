// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
  type QueryClientProviderProps,
} from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, Paginated } from '@nodus/contracts';

import { chatKeys } from './api.js';
import { useDeleteMessage, useEditMessage } from './message-mutations.js';

/**
 * Детерминированные тесты оптимистичности (канон I4/patterns.md): мутация
 * применена к кэшу ДО resolve ответа сервера (контролируемый deferred, без
 * миллисекундных ожиданий); reject → откат по снапшоту.
 */

const CONV = '11111111-1111-4111-8111-111111111111';
const M1 = '22222222-2222-4222-8222-222222222222';

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client } satisfies QueryClientProviderProps,
      children,
    );
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const message = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: M1,
  conversationId: CONV,
  seq: 1,
  author: { id: 'me', displayName: 'Я', avatarUrl: null },
  text: 'исходный текст',
  replyToId: null,
  reply: null,
  threadRootId: null,
  threadRepliesCount: 0,
  reactions: [],
  attachments: [],
  editedAt: null,
  deletedAt: null,
  pinned: false,
  forwardedFrom: null,
  readAt: '2026-09-24T10:00:00Z',
  readBy: [],
  createdAt: '2026-09-24T09:00:00Z',
  ...overrides,
});

function seed(client: QueryClient, m: ChatMessage) {
  const page: Paginated<ChatMessage> = { items: [m], nextCursor: null };
  client.setQueryData(chatKeys.messages(CONV), page);
}

function items(client: QueryClient): ChatMessage[] {
  return (client.getQueryData(chatKeys.messages(CONV)) as Paginated<ChatMessage>).items;
}

function stubFetch(gate: Promise<Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'PATCH' || method === 'DELETE') return gate;
      return new Response(JSON.stringify({ items: [], nextCursor: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('useEditMessage — оптимистичность (A4)', () => {
  it('текст/editedAt/readAt=null в кэше ДО ответа сервера, onSuccess — серверная версия', async () => {
    const client = new QueryClient();
    seed(client, message());
    const gate = deferred<Response>();
    stubFetch(gate.promise);
    const { result } = renderHook(() => useEditMessage(CONV), { wrapper: makeWrapper(client) });

    await act(async () => {
      result.current.mutate({ messageId: M1, text: 'новый текст' });
    });

    // Оптимистично: до resolve.
    let cached = items(client)[0];
    expect(cached?.text).toBe('новый текст');
    expect(cached?.editedAt).not.toBeNull();
    // «Повторный пуш прочитавшим» (решение #41): галочки read → sent.
    expect(cached?.readAt).toBeNull();

    const server = message({ text: 'новый текст', editedAt: '2026-09-24T11:00:00Z', readAt: null });
    await act(async () => {
      gate.resolve(
        new Response(JSON.stringify(server), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    cached = items(client)[0];
    expect(cached?.editedAt).toBe('2026-09-24T11:00:00Z');
  });

  it('ошибка сервера — откат по снапшоту', async () => {
    const client = new QueryClient();
    seed(client, message());
    const gate = deferred<Response>();
    stubFetch(gate.promise);
    const { result } = renderHook(() => useEditMessage(CONV), { wrapper: makeWrapper(client) });

    await act(async () => {
      result.current.mutate({ messageId: M1, text: 'новый текст' });
    });
    expect(items(client)[0]?.text).toBe('новый текст');

    await act(async () => {
      gate.reject(new Error('network'));
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    const rolled = items(client)[0];
    expect(rolled?.text).toBe('исходный текст');
    expect(rolled?.editedAt).toBeNull();
    expect(rolled?.readAt).toBe('2026-09-24T10:00:00Z');
  });
});

describe('useDeleteMessage — прогноз правила следа (A5)', () => {
  it('прочитанное — оптимистичное надгробие ДО ответа; сервер подтверждает', async () => {
    const client = new QueryClient();
    seed(client, message({ readAt: '2026-09-24T10:00:00Z' }));
    const gate = deferred<Response>();
    stubFetch(gate.promise);
    const { result } = renderHook(() => useDeleteMessage(), { wrapper: makeWrapper(client) });

    await act(async () => {
      result.current.mutate({ conversationId: CONV, messageId: M1 });
    });
    let cached = items(client)[0];
    expect(cached?.deletedAt).not.toBeNull();
    expect(cached?.text).toBe('');

    const tombstone = message({ deletedAt: '2026-09-24T12:00:00Z', text: '', readAt: null });
    await act(async () => {
      gate.resolve(
        new Response(JSON.stringify(tombstone), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    cached = items(client)[0];
    expect(cached?.deletedAt).toBe('2026-09-24T12:00:00Z');
  });

  it('непрочитанное — исчезает бесследно (204)', async () => {
    const client = new QueryClient();
    seed(client, message({ readAt: null }));
    const gate = deferred<Response>();
    stubFetch(gate.promise);
    const { result } = renderHook(() => useDeleteMessage(), { wrapper: makeWrapper(client) });

    await act(async () => {
      result.current.mutate({ conversationId: CONV, messageId: M1 });
    });
    expect(items(client)).toHaveLength(0);

    await act(async () => {
      gate.resolve(new Response(null, { status: 204 }));
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(items(client)).toHaveLength(0);
  });

  it('прогноз разошёлся с сервером (прочитали между кликом и ответом) — серверная истина', async () => {
    const client = new QueryClient();
    seed(client, message({ readAt: null }));
    const gate = deferred<Response>();
    stubFetch(gate.promise);
    const { result } = renderHook(() => useDeleteMessage(), { wrapper: makeWrapper(client) });

    await act(async () => {
      result.current.mutate({ conversationId: CONV, messageId: M1 });
    });
    expect(items(client)).toHaveLength(0);

    const tombstone = message({ deletedAt: '2026-09-24T12:00:00Z', text: '' });
    await act(async () => {
      gate.resolve(
        new Response(JSON.stringify(tombstone), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Сервер вернул надгробие — оно должно появиться в кэше, хоть прогноз был «удалить».
    const cached = items(client);
    expect(cached.some((m) => m.id === M1 && m.deletedAt !== null)).toBe(true);
  });
});
