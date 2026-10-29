import { describe, expect, it } from 'vitest';

import { PROJECT_TAB_IDS, readHiddenTabs, visibleTabs } from './project-tabs.js';

describe('вкладки карточки проекта', () => {
  it('без памяти видны все вкладки в порядке реестра', () => {
    expect(visibleTabs(readHiddenTabs(null))).toEqual([...PROJECT_TAB_IDS]);
  });

  it('скрытые вкладки читаются из памяти, мусор и неизвестные ключи отбрасываются', () => {
    expect(readHiddenTabs('["history","nope",42]')).toEqual(['history']);
    expect(readHiddenTabs('не json')).toEqual([]);
    expect(readHiddenTabs('{"history":true}')).toEqual([]);
  });

  it('«Задачи» скрыть нельзя — первичная вкладка рабочей зоны', () => {
    expect(readHiddenTabs('["tasks","channel"]')).toEqual(['channel']);
    expect(visibleTabs(['channel'])).not.toContain('channel');
    expect(visibleTabs(['channel'])).toContain('tasks');
  });
});
