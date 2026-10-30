import { describe, expect, it } from 'vitest';

import { PROJECT_TAB_IDS, primaryTab, readHiddenTabs, visibleTabs } from './project-tabs.js';

describe('вкладки карточки проекта', () => {
  it('без памяти видны все вкладки в порядке реестра, «Структура» — первой', () => {
    expect(visibleTabs(PROJECT_TAB_IDS, readHiddenTabs(null, 'tasks'), 'tasks')).toEqual([
      ...PROJECT_TAB_IDS,
    ]);
    expect(PROJECT_TAB_IDS[0]).toBe('structure');
  });

  it('скрытые вкладки читаются из памяти, мусор и неизвестные ключи отбрасываются', () => {
    expect(readHiddenTabs('["history","nope",42]', 'tasks')).toEqual(['history']);
    expect(readHiddenTabs('не json', 'tasks')).toEqual([]);
    expect(readHiddenTabs('{"history":true}', 'tasks')).toEqual([]);
  });

  it('первичная вкладка не скрывается: hasTaskNodes → «Структура» нескрываема', () => {
    const primary = primaryTab(true);
    expect(primary).toBe('structure');
    expect(readHiddenTabs('["structure","channel"]', primary)).toEqual(['channel']);
    const visible = visibleTabs(
      PROJECT_TAB_IDS,
      readHiddenTabs('["structure","channel"]', primary),
      primary,
    );
    expect(visible).not.toContain('channel');
    expect(visible).toContain('structure');
  });

  it('без узлов с задачами первичная — «Задачи», «Структура» скрывается', () => {
    const primary = primaryTab(false);
    expect(primary).toBe('tasks');
    expect(readHiddenTabs('["tasks","structure"]', primary)).toEqual(['structure']);
    const visible = visibleTabs(PROJECT_TAB_IDS, ['structure'], primary);
    expect(visible).not.toContain('structure');
    expect(visible).toContain('tasks');
  });
});
