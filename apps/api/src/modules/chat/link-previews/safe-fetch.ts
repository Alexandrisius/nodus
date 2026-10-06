import { Agent, fetch as undiciFetch } from 'undici';
import dns from 'node:dns/promises';

import { SsrfBlockedError } from './link-preview.guards.js';
import { isPrivateIpAddress } from './ip-ranges.js';

/**
 * Безопасный внешний фетч превью (#212, security-ревью): КАЖДОЕ соединение
 * (включая редирект-хопы) идёт через undici-агент с pinned-DNS lookup —
 * адреса резолвятся ЗДЕСЬ, ВСЕ A/AAAA проверяются против приватных
 * диапазонов, коннект пиннится на проверенный IP (закрыт и hostname-alias
 * «домен → приватный IP», и TOCTOU между проверкой и коннектом, и
 * редиректы og:image на внутренние адреса). Один слой для linkpeek
 * (опция fetch) и og:image-скачивания. Ошибка блока — SsrfBlockedError
 * (общий с гвардами адреса, link-preview.guards).
 */

export { SsrfBlockedError };

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  addresses: { address: string; family: number }[],
) => void;

/** Pinned-DNS lookup: резолв → проверка всех адресов → отдаём ПРОВЕРЕННЫЙ
 *  адрес (коннект идёт к нему, а не к повторному резолву хоста). */
async function guardedLookup(
  hostname: string,
  options: { family?: number },
  callback: LookupCallback,
): Promise<void> {
  try {
    // Литеральный IP: проверяем напрямую (dns.lookup вернул бы как есть).
    if (/^[0-9.]+$/.test(hostname) || hostname.includes(':')) {
      if (isPrivateIpAddress(hostname)) {
        callback(new SsrfBlockedError(`private address ${hostname}`), []);
        return;
      }
      callback(null, [{ address: hostname, family: hostname.includes(':') ? 6 : 4 }]);
      return;
    }
    const families = options.family === 6 ? [6] : options.family === 4 ? [4] : [4, 6];
    const results: { address: string; family: number }[] = [];
    for (const family of families) {
      try {
        const list = family === 4 ? await dns.resolve4(hostname) : await dns.resolve6(hostname);
        results.push(...list.map((address) => ({ address, family })));
      } catch {
        /* записи этого семейства нет — норм */
      }
    }
    if (results.length === 0) {
      callback(Object.assign(new Error(`ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' }), []);
      return;
    }
    // ЛЮБОЙ приватный из всех A/AAAA — блок (спека: «любой приватный»).
    const safe = results.filter((r) => !isPrivateIpAddress(r.address));
    if (safe.length === 0 || safe.length !== results.length) {
      callback(new SsrfBlockedError(`private dns record ${hostname}`), []);
      return;
    }
    callback(null, [safe[0]!]);
  } catch (error) {
    callback(error as NodeJS.ErrnoException, []);
  }
}

let sharedAgent: Agent | null = null;

/** Агент-синглтон (переиспользуется между задачами). */
export function ssrfGuardedAgent(): Agent {
  sharedAgent ??= new Agent({
    connect: { lookup: guardedLookup as never },
  });
  return sharedAgent;
}

/** fetch через гвард-агент: все соединения/редиректы проходят pinned-DNS.
 *  ДИСЦИПЛИНА (security-ревью): перед КАЖДЫМ вызовом — assertFetchableUrl —
 *  Node net.connect для ЛИТЕРАЛЬНЫХ хостов не вызывает lookup (isIP-быстрый
 *  путь), агент один их не ловит; агент закрывает DNS-имена.
 *  fetch — ИЗ ПАКЕТА undici (совместим с Agent той же версии; встроенный
 *  fetch Node держит внутренний undici иной версии — «invalid onRequestStart
 *  method» на чужом dispatcher'е). */
export function ssrfGuardedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return undiciFetch(url, { ...init, dispatcher: ssrfGuardedAgent() } as never) as never;
}

export async function disposeSsrfAgent(): Promise<void> {
  await sharedAgent?.close();
  sharedAgent = null;
}
