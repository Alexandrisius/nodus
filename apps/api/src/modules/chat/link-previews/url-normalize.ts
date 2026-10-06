/**
 * Нормализация URL для кэша превью ссылок (#212): ОДНА функция для ключа
 * link_previews и обогащения DTO (спека: «общая для ключа и обогащения»).
 * Lower scheme/host, сортировка query-параметров, срез трекеров
 * (utm-префиксы, fbclid, gclid), без фрагмента. message_links.url хранит
 * сырой URL — нормализация на лету по странице (≤100).
 */

const TRACKING_PARAMS = [/^utm_/i, /^fbclid$/i, /^gclid$/i];

/** Нормализованный URL или null (не URL / не http(s)). Стабильна: один и тот
 *  же адрес в любом написании даёт один ключ. */
export function normalizeUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  parsed.hash = '';
  parsed.hostname = parsed.hostname.toLowerCase();
  const params = [...parsed.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAMS.some((re) => re.test(key)))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  parsed.search = '';
  for (const [key, value] of params) parsed.searchParams.append(key, value);
  return parsed.toString();
}

/** Домен для карточки-заглушки (без www, схема не нужна). */
export function urlDomain(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./i, '');
  } catch {
    return raw;
  }
}

/** Self-link (собственный домен портала): короткое замыкание без фетча —
 *  превью из домена (self-domain карточка, спека #212). */
export function isSelfDomain(raw: string, selfHosts: readonly string[]): boolean {
  const host = urlDomain(raw).toLowerCase();
  return selfHosts.some((self) => host === self || host.endsWith(`.${self}`));
}

/** jobId очереди для нормализованного URL (без двоеточий — BullMQ
 *  запрещает ':' в custom id, урок #150). */
export function previewJobId(normalizedUrl: string): string {
  return `lp-${encodeURIComponent(normalizedUrl).replace(/%/g, '~')}`;
}
