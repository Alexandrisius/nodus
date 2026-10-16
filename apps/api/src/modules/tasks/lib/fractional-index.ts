/**
 * Fractional-index ключи порядка карточек (канон трека 1: TEXT на обеих
 * осях, keyset `(order, id)`). Ключ — строка цифр base62 в БАЙТОВОМ порядке
 * ('0'<'9'<'A'<'Z'<'a'<'z'); колонки в БД — COLLATE "C", иначе локальная
 * коллация переставит регистры. Ключ никогда не оканчивается на '0' —
 * между любыми двумя ключами всегда есть третий. Алгоритм — midpoint
 * дробной части (rocicorp/fractional-indexing, Evan Wallace «Implementing
 * Fractional Indexing»).
 */
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function digit(ch: string | undefined): number {
  const value = ch === undefined ? 0 : DIGITS.indexOf(ch);
  if (value < 0) throw new Error(`fractional-index: invalid digit "${ch}"`);
  return value;
}

/** Середина между a и b (b = null — «бесконечность»), a < b. */
function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    let n = 0;
    while ((a[n] ?? '0') === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const da = digit(a[0]);
  const db = b === null ? DIGITS.length : digit(b[0]);
  if (db - da > 1) return DIGITS[Math.round((da + db) / 2)]!;
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return DIGITS[da]! + midpoint(a.slice(1), null);
}

/** Ключ строго между before и after (null — край колонки). */
export function keyBetween(before: string | null, after: string | null): string {
  if (before !== null && after !== null && before >= after) {
    throw new Error(`fractional-index: "${before}" >= "${after}"`);
  }
  if (before !== null && before.endsWith('0')) throw new Error('fractional-index: trailing zero');
  if (after !== null && (after === '' || after.endsWith('0'))) {
    throw new Error('fractional-index: invalid upper key');
  }
  return midpoint(before ?? '', after);
}
