/**
 * Приватные/зарезервированные диапазоны адресов (SSRF-гвард превью #212,
 * спека: «любой приватный → blocked»): RFC1918, loopback, link-local
 * (вкл. cloud-metadata 169.254.169.254), ULA, v4-mapped, multicast,
 * CGNAT, zero-network. Чистая функция — unit-тесты.
 */

export function isPrivateIpAddress(ip: string): boolean {
  if (ip.includes('.') && !ip.includes(':')) return isPrivateV4(ip);
  const normalized = ip.replace(/^\[|\]$/g, '').toLowerCase();
  // v4-mapped/compatible ::ffff:a.b.c.d → проверяем как v4.
  const mapped = normalized.match(/^(?:::ffff:|::)(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateV4(mapped[1]!);
  if (normalized === '::1' || normalized === '::') return true; // loopback/unspecified
  // ULA fc00::/7 (вкл. fd00::/8) и link-local fe80::/10.
  const first = parseInt(normalized.split(':')[0] ?? '0', 16);
  if (!Number.isNaN(first)) {
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10
    if ((first & 0xff00) >= 0xff00) return true; // multicast ff00::/8 + reserved
  }
  return false;
}

function isPrivateV4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true;
  const [a, b] = [parts[0]!, parts[1]!];
  if (a === 0 || a === 10 || a === 127) return true; // this-host/RFC1918/loopback
  if (a === 169 && b === 254) return true; // link-local (cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 + 192.0.2.0/24
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a >= 224) return true; // multicast + reserved
  return false;
}
