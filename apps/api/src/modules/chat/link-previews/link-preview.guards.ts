/**
 * Безопасный фетч превью ссылки (#212, ADR-0018): наши гварды (порт/креды/
 * литеральные приватные IP) поверх linkpeek (pinned-DNS через наш агент,
 * ручные редиректы, стрим-лимит, таймаут). Чистые проверки — отдельные
 * функции (unit-тесты); сеть и SILO — в сервисе-воркере.
 */
import { isPrivateHost } from 'linkpeek';

/** Разрешённые порты внешнего фетча (спека #212: только 80/443/не указан). */
const ALLOWED_PORTS = new Set(['', '80', '443']);

export class SsrfBlockedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'SsrfBlockedError';
  }
}

/** Гвард адреса ДО любого фетча: схема http/https, порт 80/443/не указан,
 *  без учётных данных, литеральный хост НЕ приватный (isPrivateHost
 *  linkpeek — полный парсер v4/v6/mapped/NAT64; security-ревью: Node
 *  net.connect для литералов не зовёт lookup-гвард агента — проверяем
 *  здесь, на КАЖДОМ хопе ручного цикла). DNS-имена проверяет pinned-DNS
 *  агент (safe-fetch). Бросает SsrfBlockedError. */
export function assertFetchableUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new SsrfBlockedError('invalid url');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SsrfBlockedError('scheme not http/https');
  }
  if (!ALLOWED_PORTS.has(parsed.port)) {
    throw new SsrfBlockedError(`port ${parsed.port || '(default)'} not allowed`);
  }
  if (parsed.username || parsed.password) {
    throw new SsrfBlockedError('credentials in url');
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  if (isPrivateHost(hostname)) {
    throw new SsrfBlockedError(`private host ${hostname}`);
  }
  return parsed;
}

/** Лимиты полей метаданных: недоверенный текст (эскейп на рендере + длина). */
export const FIELD_LIMITS = { title: 300, description: 600, siteName: 120 } as const;

export function clampField(value: string | null | undefined, limit: number): string | null {
  if (!value) return null;
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length === 0) return null;
  return clean.length > limit ? clean.slice(0, limit - 1) + '…' : clean;
}

/** Свой User-Agent бота (не подделываемся под браузер). */
export const PREVIEW_USER_AGENT = 'NodusLinkPreview/1.0 (+https://nodus.by)';

/** Стрим-лимит скачивания og:image (2 МБ, спека). */
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;

/** Per-user лимит фетчей в час (Redis-счётчик, спека ~30/час). */
export const USER_FETCH_LIMIT_PER_HOUR = 30;
