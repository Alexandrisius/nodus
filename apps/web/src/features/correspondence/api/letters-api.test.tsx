// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
  type QueryClientProviderProps,
} from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CreateLetterBody,
  LetterDetail,
  LetterListItem,
  Mailbox,
  Paginated,
} from '@nodus/contracts';

import { useAuthStore } from '../../../shared/auth-store.js';
import { lettersKeys } from '../../../shared/api/letters-keys.js';
import { useCreateLetter, type CreateLetterVars } from './letters-api.js';

const MAILBOX: Mailbox = {
  id: 'f0000000-0000-4000-8000-000000000001',
  address: 'info@passatproekt.by',
  kind: 'shared',
};
const CP_ID = 'd0000000-0000-4000-8000-000000000001';
const SERVER_ID = '80000000-0000-4000-8000-000000000099';
const OUTGOING_KEY = [...lettersKeys.list('outgoing'), null] as const;

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

/** Контролируемый deferred: ответ сервера отпускаем вручную (детерминизм,
 *  без миллисекунд — канон теста оптимистичности I4). */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function makeBody(asDocument: boolean): CreateLetterBody {
  return {
    mailboxId: MAILBOX.id,
    counterpartyId: CP_ID,
    projectId: null,
    receiveChannel: 'email',
    asDocument,
    subject: 'Исходящее',
    body: '',
    attachments: [],
    inReplyToId: null,
  };
}

function makeVars(asDocument = false): CreateLetterVars {
  return { body: makeBody(asDocument), counterpartyName: 'АО «Галургия»', mailbox: MAILBOX };
}

function serverLetter(asDocument: boolean): LetterDetail {
  const item: LetterListItem = {
    id: SERVER_ID,
    type: 'outgoing',
    receiveChannel: 'email',
    mailbox: MAILBOX,
    counterparty: { id: CP_ID, name: 'АО «Галургия»' },
    subject: 'Исходящее',
    recipients: [],
    cc: [],
    date: new Date().toISOString(),
    registration: asDocument
      ? {
          regNumber: 'Исх-2026/42',
          regDate: '2026-09-22',
          type: 'outgoing',
          documentKind: { id: 'e0000000-0000-4000-8000-000000000001', name: 'Письмо' },
          counterparty: { id: CP_ID, name: 'АО «Галургия»' },
          project: null,
          addressee: null,
          deadline: null,
          correspondentNumber: null,
          correspondentDate: null,
        }
      : null,
    documentStatus: asDocument ? 'in_work' : null,
    inReplyToId: null,
  };
  return {
    ...item,
    body: '',
    attachments: [],
    resolutions: [],
    conversationId: 'a0000000-0000-4000-8000-000000000199',
  };
}

const EMPTY: Paginated<LetterListItem> = { items: [], nextCursor: null };

describe('useCreateLetter: оптимистичность простого письма (I4)', () => {
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

  it('письмо встаёт в «Отправленные» ДО ответа сервера, заменяется на серверное', async () => {
    const client = new QueryClient();
    client.setQueryData(OUTGOING_KEY, EMPTY);
    const gate = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === 'POST' ? gate.promise : jsonResponse(200, EMPTY),
      ),
    );

    const { result } = renderHook(() => useCreateLetter(), { wrapper: makeWrapper(client) });
    await act(async () => {
      result.current.mutate(makeVars(false));
    });

    const optimistic = client.getQueryData<Paginated<LetterListItem>>(OUTGOING_KEY);
    expect(optimistic?.items).toHaveLength(1);
    expect(optimistic?.items[0]?.id.startsWith('temp-')).toBe(true);
    expect(optimistic?.items[0]?.counterparty.name).toBe('АО «Галургия»');

    await act(async () => gate.resolve(jsonResponse(201, serverLetter(false))));
    await waitFor(() => {
      const done = client.getQueryData<Paginated<LetterListItem>>(OUTGOING_KEY);
      expect(done?.items[0]?.id).toBe(SERVER_ID);
      expect(client.getQueryData(lettersKeys.detail(SERVER_ID))).toBeTruthy();
    });
  });

  it('ошибка сервера → откат по снапшоту', async () => {
    const client = new QueryClient();
    client.setQueryData(OUTGOING_KEY, EMPTY);
    const gate = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === 'POST' ? gate.promise : jsonResponse(200, EMPTY),
      ),
    );

    const { result } = renderHook(() => useCreateLetter(), { wrapper: makeWrapper(client) });
    await act(async () => {
      result.current.mutate(makeVars(false));
    });
    expect(client.getQueryData<Paginated<LetterListItem>>(OUTGOING_KEY)?.items).toHaveLength(1);

    await act(async () => {
      gate.resolve(jsonResponse(500, { code: 'INTERNAL_ERROR', message: 'x' }));
    });
    await waitFor(() => {
      expect(client.getQueryData<Paginated<LetterListItem>>(OUTGOING_KEY)?.items).toHaveLength(0);
    });
  });

  it('исходящий ДОКУМЕНТ — пессимистично: до ответа сервера в кэше ничего нет', async () => {
    const client = new QueryClient();
    client.setQueryData(OUTGOING_KEY, EMPTY);
    const gate = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === 'POST' ? gate.promise : jsonResponse(200, EMPTY),
      ),
    );

    const { result } = renderHook(() => useCreateLetter(), { wrapper: makeWrapper(client) });
    await act(async () => {
      result.current.mutate(makeVars(true));
    });

    // Рег.№ присваивает сервер — оптимистичная вставка документа запрещена.
    expect(client.getQueryData<Paginated<LetterListItem>>(OUTGOING_KEY)?.items).toHaveLength(0);

    await act(async () => gate.resolve(jsonResponse(201, serverLetter(true))));
    await waitFor(() => {
      expect(client.getQueryData(lettersKeys.detail(SERVER_ID))).toBeTruthy();
    });
  });
});
