import { useAuthStore } from './auth-store.js';

/**
 * HTTP-клиент SPA: Bearer access-токен из auth-store, единый повтор
 * запроса после прозрачного refresh (cookie httpOnly — JS её не видит).
 * Ошибки API — единый формат { code, message, details?, traceId }
 * (traceId — корреляция с серверными логами, I7).
 * Каждая мутация идемпотентна (I7): POST/PATCH/DELETE автоматически несут
 * заголовок Idempotency-Key (uuid на ВЫЗОВ api) — повтор после refresh идёт
 * с ТЕМ ЖЕ ключом, бэкенд дедуплицирует ретраи/двойные клики. MSW-хендлеры
 * заголовок игнорируют.
 */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
    readonly traceId?: string,
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
  /** Явный ключ идемпотентности — когда один ЛОГИЧЕСКИЙ запрос шлётся
   *  несколькими вызовами (ручной retry той же операции). По умолчанию
   *  генерируется на вызов. */
  idempotencyKey?: string;
}

const MUTATION_METHODS = new Set(['POST', 'PATCH', 'DELETE']);

async function rawRequest(path: string, options: RequestOptions): Promise<Response> {
  const { accessToken } = useAuthStore.getState();
  const headers: Record<string, string> = {};
  if (options.auth !== false && accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  if (MUTATION_METHODS.has(options.method ?? 'GET')) {
    headers['Idempotency-Key'] = options.idempotencyKey ?? crypto.randomUUID();
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
      traceId?: string;
    } | null;
    throw new ApiError(
      errorBody?.code ?? 'INTERNAL_ERROR',
      errorBody?.message ?? `HTTP ${response.status}`,
      response.status,
      errorBody?.details,
      errorBody?.traceId,
    );
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

interface UploadOptions {
  /** Доля 0..1 — для индикатора прогресса (XHR upload.onprogress). */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  idempotencyKey?: string;
}

function xhrUpload<T>(path: string, form: FormData, options: UploadOptions): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/v1${path}`);
    const { accessToken } = useAuthStore.getState();
    if (accessToken) xhr.setRequestHeader('authorization', `Bearer ${accessToken}`);
    xhr.setRequestHeader('Idempotency-Key', options.idempotencyKey ?? crypto.randomUUID());
    xhr.withCredentials = true; // refresh-cookie nodus_refresh
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) options.onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status === 204) {
        resolve(undefined as T);
        return;
      }
      let body: unknown;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = undefined; // не-JSON ответ (напр. обрыв соединения)
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as T);
        return;
      }
      const errorBody = body as {
        code?: string;
        message?: string;
        details?: Record<string, unknown>;
        traceId?: string;
      } | null;
      reject(
        new ApiError(
          errorBody?.code ?? 'INTERNAL_ERROR',
          errorBody?.message ?? `HTTP ${xhr.status}`,
          xhr.status,
          errorBody?.details,
          errorBody?.traceId,
        ),
      );
    };
    xhr.onerror = () => reject(new ApiError('INTERNAL_ERROR', 'Network error', 0));
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));
    options.signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

/** Загрузка файла (multipart) — единый HTTP-контур проекта (patterns.md):
 *  тот же auth/refresh/Idempotency-Key, но XHR ради событий прогресса
 *  (fetch upload-progress не умеет). 401 → один прозрачный refresh и повтор. */
export async function apiUpload<T>(
  path: string,
  form: FormData,
  options: UploadOptions = {},
): Promise<T> {
  try {
    return await xhrUpload<T>(path, form, options);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      const refreshed = await useAuthStore.getState().tryRefresh();
      if (refreshed) return xhrUpload<T>(path, form, options);
    }
    throw error;
  }
}
