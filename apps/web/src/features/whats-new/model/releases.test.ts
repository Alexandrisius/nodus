import { describe, expect, it, vi } from 'vitest';

import { RELEASE_MODULES } from './group-release.js';
import { compareVersionsDesc, releaseSchema } from './release-schema.js';
import { parseReleases, RELEASES } from './releases.js';

/**
 * Страж данных «Что нового» (#386): каждый файл `releases/*.json` обязан
 * пройти строгую схему, называться своей версией, ссылаться на модули
 * реестра и говорить с пользователем без технического жаргона. Ломается
 * здесь, в CI, — а не молчаливым пропуском выпуска на проде.
 */
const raw = import.meta.glob<unknown>('../releases/*.json', { eager: true, import: 'default' });
const MODULE_IDS = new Set(RELEASE_MODULES.map((m) => m.id));
/** Слова разработчиков, непонятные сотрудникам: номера issue/PR, слои, инфраструктура. */
const JARGON =
  /#\d|\b(API|PR|WS|WebSocket|Redis|endpoint|backend|frontend|бэкенд|фронтенд|commit|deploy|CI|токен|кэш|рефактор\w*|коммит\w*|миграци\w*|эндпоинт\w*)\b/i;

describe('данные выпусков', () => {
  const entries = Object.entries(raw);

  it('есть хотя бы один выпуск', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it.each(entries)('%s — строгая схема, имя файла = версия, модули из реестра', (path, data) => {
    const release = releaseSchema.parse(data);
    expect(path.endsWith(`/${release.version}.json`)).toBe(true);
    for (const item of release.items) expect(MODULE_IDS).toContain(item.module);
    const titles = release.items.map((i) => i.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it.each(entries)('%s — тексты без технического жаргона', (_path, data) => {
    const release = releaseSchema.parse(data);
    for (const text of [
      release.summary ?? '',
      ...release.items.flatMap((i) => [i.title, i.text]),
    ]) {
      expect(text, text).not.toMatch(JARGON);
    }
  });

  it('версии уникальны, дата не убывает вместе с версией', () => {
    const versions = RELEASES.map((r) => r.version);
    expect(new Set(versions).size).toBe(versions.length);
    for (let i = 1; i < RELEASES.length; i += 1) {
      expect(RELEASES[i - 1]!.date >= RELEASES[i]!.date).toBe(true);
    }
  });
});

describe('загрузчик выпусков', () => {
  it('сортирует по semver убыванию (10 > 9)', () => {
    expect(['0.9.0', '0.10.0', '0.9.1'].sort(compareVersionsDesc)).toEqual([
      '0.10.0',
      '0.9.1',
      '0.9.0',
    ]);
  });

  it('невалидный файл пропускается, а не роняет портал', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const item = { module: 'tasks', type: 'new', title: 'Заголовок', text: 'Текст пункта выпуска' };
    const parsed = parseReleases({
      'a.json': { version: '0.2.0', date: '2026-10-20', items: [item] },
      'b.json': { version: 'oops', date: '2026-10-21', items: [item] },
    });
    expect(parsed.map((r) => r.version)).toEqual(['0.2.0']);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
