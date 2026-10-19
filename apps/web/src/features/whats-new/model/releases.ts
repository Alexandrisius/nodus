import { compareVersionsDesc, releaseSchema, type Release } from './release-schema.js';

/**
 * Выпуски портала — данные в репозитории (`../releases/<version>.json`, по
 * файлу на релиз: параллельные выпуски не конфликтуют), попадают в бандл
 * сборкой. Невалидный файл пропускается с предупреждением, а не роняет
 * портал: CI ловит его unit-тестом данных раньше (releases.test.ts).
 */
const files = import.meta.glob<unknown>('../releases/*.json', { eager: true, import: 'default' });

export function parseReleases(raw: Record<string, unknown>): Release[] {
  return Object.entries(raw)
    .flatMap(([path, data]) => {
      const parsed = releaseSchema.safeParse(data);
      if (parsed.success) return [parsed.data];
      console.warn('[whats-new] пропущен невалидный выпуск', path, parsed.error.issues);
      return [];
    })
    .sort((a, b) => compareVersionsDesc(a.version, b.version));
}

/** Все выпуски, новые первыми. */
export const RELEASES: readonly Release[] = parseReleases(files);

/** Последний выпуск (то, что сейчас на проде) или null до первого релиза. */
export const LATEST_RELEASE: Release | null = RELEASES[0] ?? null;
