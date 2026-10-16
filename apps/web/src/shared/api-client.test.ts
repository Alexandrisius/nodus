import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api, ApiError, apiUpload } from './api-client.js';
import { useAuthStore } from './auth-store.js';

/** Ответ fetch-заглушки. */
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Поддельный XHR: статус ответа — из очереди, заголовки запросов копятся. */
class FakeXhr {
  static statuses: number[] = [];
  static sent: { headers: Record<string, string> }[] = [];
  status = 0;
  responseText = '';
  withCredentials = false;
  upload: { onprogress: ((e: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  private headers: Record<string, string> = {};
  open() {}
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  abort() {}
  send() {
    FakeXhr.sent.push({ headers: this.headers });
    this.status = FakeXhr.statuses.shift() ?? 500;
    this.responseText =
      this.status === 401 ? JSON.stringify({ code: 'UNAUTHENTICATED' }) : JSON.stringify({ ok: 1 });
    queueMicrotask(() => this.onload?.());
  }
}

describe('api-client', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'authenticated', accessToken: 'old', user: null });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('успешный ответ: 204 и пустое тело → undefined, JSON → данные', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/no-content')) return new Response(null, { status: 204 });
        if (url.endsWith('/empty')) return new Response('', { status: 200 });
        return jsonResponse(200, { a: 1 });
      }),
    );
    await expect(api('/no-content')).resolves.toBeUndefined();
    await expect(api('/empty', { method: 'POST' })).resolves.toBeUndefined();
    await expect(api('/json')).resolves.toEqual({ a: 1 });
  });

  it('успешный ответ с не-JSON телом → ApiError единого формата, не голый SyntaxError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<!doctype html><html></html>', { status: 200 })),
    );
    const error = await api('/html').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('INTERNAL_ERROR');
    expect((error as ApiError).status).toBe(200);
  });

  it('явный bearer: заголовок из опции, а не из стора; 401 не запускает refresh', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => jsonResponse(401, { code: 'UNAUTHENTICATED' }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(api('/auth/me', { bearer: 'fresh' })).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer fresh');
  });

  it('apiUpload: повтор после 401-refresh идёт с ТЕМ ЖЕ Idempotency-Key (I7)', async () => {
    FakeXhr.statuses = [401, 200];
    FakeXhr.sent = [];
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, { accessToken: 'new', expiresIn: 900 })),
    );

    await expect(apiUpload('/files', new FormData())).resolves.toEqual({ ok: 1 });

    expect(FakeXhr.sent).toHaveLength(2);
    const [first, second] = FakeXhr.sent;
    expect(first?.headers['Idempotency-Key']).toBeTruthy();
    expect(second?.headers['Idempotency-Key']).toBe(first?.headers['Idempotency-Key']);
    expect(second?.headers.authorization).toBe('Bearer new');
  });
});
