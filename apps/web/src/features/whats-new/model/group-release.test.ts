import { describe, expect, it } from 'vitest';

import { groupByModule, modulesWithChanges, resolveModule } from './group-release.js';
import type { Release, ReleaseItem } from './release-schema.js';
import { isUnseen } from './whats-new-store.js';

const item = (module: string, type: ReleaseItem['type'], title: string): ReleaseItem => ({
  module,
  type,
  title,
  text: 'Описание пункта выпуска',
});

describe('группировка выпуска по модулям', () => {
  const items = [
    item('general', 'new', 'Общее'),
    item('chat', 'fixed', 'Чат-фикс'),
    item('tasks', 'fixed', 'Задачи-фикс'),
    item('chat', 'new', 'Чат-новое'),
    item('tasks', 'improved', 'Задачи-улучшение'),
  ];

  it('модули в порядке рейки, «Общее» последним; внутри — новое → улучшено → исправлено', () => {
    const groups = groupByModule(items, null);
    expect(groups.map((g) => g.module.id)).toEqual(['tasks', 'chat', 'general']);
    expect(groups[0]!.items.map((i) => i.title)).toEqual(['Задачи-улучшение', 'Задачи-фикс']);
    expect(groups[1]!.items.map((i) => i.title)).toEqual(['Чат-новое', 'Чат-фикс']);
  });

  it('фильтр оставляет один модуль', () => {
    const groups = groupByModule(items, 'chat');
    expect(groups).toHaveLength(1);
    expect(groups[0]!.items).toHaveLength(2);
  });

  it('неизвестный модуль падает в «Общее», а не теряется', () => {
    expect(resolveModule('typo').id).toBe('general');
    expect(groupByModule([item('typo', 'new', 'X')], null)[0]!.module.id).toBe('general');
  });

  it('чипы фильтра — только модули с изменениями, в порядке рейки', () => {
    const releases: Release[] = [
      { version: '0.2.0', date: '2026-10-20', items: [item('chat', 'new', 'a')] },
      { version: '0.1.0', date: '2026-10-19', items: [item('tasks', 'new', 'b')] },
    ];
    expect(modulesWithChanges(releases).map((m) => m.id)).toEqual(['tasks', 'chat']);
  });
});

describe('отметка «просмотрено»', () => {
  it('по пользователю: чужая отметка не гасит мою', () => {
    const seen = { 'user-a': '0.2.0' };
    expect(isUnseen(seen, 'user-a', '0.2.0')).toBe(false);
    expect(isUnseen(seen, 'user-b', '0.2.0')).toBe(true);
    expect(isUnseen(seen, 'user-a', '0.3.0')).toBe(true);
  });

  it('без пользователя или выпусков — показывать нечего', () => {
    expect(isUnseen({}, undefined, '0.1.0')).toBe(false);
    expect(isUnseen({}, 'user-a', undefined)).toBe(false);
  });
});
