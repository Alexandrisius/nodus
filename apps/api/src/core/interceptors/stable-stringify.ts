import { createHash } from 'node:crypto';

/** sha256 hex произвольной строки. */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Детерминированная сериализация тела запроса для payload-hash
 * (ключи сортируются рекурсивно — порядок полей не влияет на хэш).
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`);
  return `{${entries.join(',')}}`;
}
