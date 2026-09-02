import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../shared/auth-store.js';

/** Ответ fetch-заглушки. */
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const TOKENS = { accessToken: 'access-jwt', expiresIn: 900 };
const USER = {
  id: '7b0a2c2e-9a9a-4b1c-9c9c-0a1b2c3d4e5f',
  email: 'admin@nodus.by',
  displayName: 'Администратор Системный',
  permissions: ['directory.read'],
};

describe('auth-store', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({ status: 'unknown', accessToken: null, user: null });
  });

  it('login: токены → me → authenticated', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.endsWith('/auth/login')) return jsonResponse(200, TOKENS);
        if (url.endsWith('/auth/me')) return jsonResponse(200, USER);
        return jsonResponse(404, { code: 'NOT_FOUND' });
      }),
    );

    await useAuthStore.getState().login('admin@nodus.by', 'secret');

    const state = useAuthStore.getState();
    expect(state.status).toBe('authenticated');
    expect(state.accessToken).toBe('access-jwt');
    expect(state.user?.displayName).toBe('Администратор Системный');
    expect(calls.map((c) => c.split('/api/v1')[1])).toEqual(['/auth/login', '/auth/me']);
  });

  it('bootstrap: живая refresh-cookie → authenticated; мёртвая → anonymous', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/auth/refresh')) return jsonResponse(200, TOKENS);
        if (url.endsWith('/auth/me')) return jsonResponse(200, USER);
        return jsonResponse(404, {});
      }),
    );
    await useAuthStore.getState().bootstrap();
    expect(useAuthStore.getState().status).toBe('authenticated');

    useAuthStore.setState({ status: 'unknown', accessToken: null, user: null });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(401, { code: 'AUTH_SESSION_INVALID', message: 'x' })),
    );
    await useAuthStore.getState().bootstrap();
    expect(useAuthStore.getState().status).toBe('anonymous');
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('logout: сбрасывает состояние даже при ошибке сети', async () => {
    useAuthStore.setState({ status: 'authenticated', accessToken: 't', user: USER });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('network down'))),
    );

    await expect(useAuthStore.getState().logout()).rejects.toThrow('network down');
    expect(useAuthStore.getState().status).toBe('anonymous');
  });
});
