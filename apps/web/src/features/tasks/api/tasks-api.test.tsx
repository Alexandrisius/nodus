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

import { useAuthStore } from '../../../shared/auth-store.js';
import { tasksKeys, useSendTaskMessage } from './tasks-api.js';

const TASK_ID = '30000000-0000-4000-8000-000000000002';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client } satisfies QueryClientProviderProps,
      children,
    );
  };
}

/** Контролируемый deferred: ответ сервера отпускаем вручную (детерминизм, без миллисекунд). */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const EMPTY: Paginated<ChatMessage> = { items: [], nextCursor: null };

describe('useSendTaskMessage: оптимистичность (I4)', () => {
  beforeEach(() => {
    useAuthStore.setState({
      status: 'authenticated',
      accessToken: 't',
      user: {
        id: '10000000-0000-4000-8000-000000000001',
        email: 'a@b.by',
        displayName: 'Тест Тест',
        permissions: [],
      },
    });
  });

  it('мутация применена к кэшу ДО resolve ответа сервера', async () => {
    const client = new QueryClient();
    const gate = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === 'POST' ? gate.promise : jsonResponse(200, EMPTY),
      ),
    );

    const { result } = renderHook(() => useSendTaskMessage(TASK_ID), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      result.current.mutate('комментарий');
    });

    const optimistic = client.getQueryData<Paginated<ChatMessage>>(tasksKeys.messages(TASK_ID));
    expect(optimistic?.items).toHaveLength(1);
    expect(optimistic?.items[0]?.id.startsWith('temp-')).toBe(true);
    expect(optimistic?.items[0]?.text).toBe('комментарий');

    const server: ChatMessage = {
      id: '60000000-0000-4000-8000-000000000099',
      conversationId: TASK_ID,
      author: {
        id: '10000000-0000-4000-8000-000000000001',
        displayName: 'Тест Тест',
        avatarUrl: null,
      },
      text: 'комментарий',
      replyToId: null,
      threadRootId: null,
      threadRepliesCount: 0,
      reactions: [],
      attachments: [],
      editedAt: null,
      createdAt: new Date().toISOString(),
    };
    await act(async () => gate.resolve(jsonResponse(201, server)));
    await waitFor(() => {
      const done = client.getQueryData<Paginated<ChatMessage>>(tasksKeys.messages(TASK_ID));
      expect(done?.items[0]?.id).toBe(server.id);
    });
  });

  it('ошибка сервера → откат по снапшоту', async () => {
    const client = new QueryClient();
    client.setQueryData(tasksKeys.messages(TASK_ID), EMPTY);
    const gate = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === 'POST' ? gate.promise : jsonResponse(200, EMPTY),
      ),
    );

    const { result } = renderHook(() => useSendTaskMessage(TASK_ID), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      result.current.mutate('упадёт');
    });
    expect(
      client.getQueryData<Paginated<ChatMessage>>(tasksKeys.messages(TASK_ID))?.items,
    ).toHaveLength(1);

    await act(async () => {
      gate.resolve(jsonResponse(500, { code: 'INTERNAL_ERROR', message: 'x' }));
    });
    await waitFor(() => {
      const rolled = client.getQueryData<Paginated<ChatMessage>>(tasksKeys.messages(TASK_ID));
      expect(rolled?.items).toHaveLength(0);
    });
  });
});
