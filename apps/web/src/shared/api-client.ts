import { useAuthStore } from './auth-store.js';

/**
 * HTTP-клиент SPA: Bearer access-токен из auth-store, единый повтор
 * запроса после прозрачного refresh (cookie httpOnly — JS её не видит).
 * Ошибки API — единый формат { code, message, details?, traceId }.
 */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** false — без Bearer (login/refresh). */
  auth?: boolean;
}

async function rawRequest(path: string, options: RequestOptions): Promise<Response> {
  const { accessToken } = useAuthStore.getState();
  const headers: Record<string, string> = {};
  if (options.auth !== false && accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  return fetch(`/api/v1${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    credentials: 'same-origin', // refresh-cookie nodus_refresh
  });
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response = await rawRequest(path, options);

  // Access протух → один прозрачный refresh и повтор (I4: без спиннеров).
  if (response.status === 401 && options.auth !== false) {
    const refreshed = await useAuthStore.getState().tryRefresh();
    if (refreshed) {
      response = await rawRequest(path, options);
    }
  }

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as {
      code?: string;
      message?: string;
      details?: Record<string, unknown>;
    } | null;
    throw new ApiError(
      errorBody?.code ?? 'INTERNAL_ERROR',
      errorBody?.message ?? `HTTP ${response.status}`,
      response.status,
      errorBody?.details,
    );
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
