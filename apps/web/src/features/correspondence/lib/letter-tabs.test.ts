import { describe, expect, it } from 'vitest';

import {
  MAX_FILE_TABS,
  activateTab,
  closeFileTab,
  fileTabId,
  initialTabs,
  openFileTab,
  pruneFileTabs,
} from './letter-tabs.js';

const files = (n: number) => Array.from({ length: n }, (_, i) => `f${i + 1}`);

describe('вкладки карточки письма (#55)', () => {
  it('«Тело» смонтировано сразу, «Чат» — с первого показа и дальше не размонтируется', () => {
    let state = initialTabs('body');
    expect(state.visited).toEqual(['body']);
    state = activateTab(state, 'chat');
    state = activateTab(state, 'body');
    expect(state.active).toBe('body');
    expect(state.visited).toEqual(['body', 'chat']);
  });

  it('вложение открывается вкладкой один раз, повтор — переход к ней', () => {
    let state = openFileTab(initialTabs('body'), 'f1');
    state = activateTab(state, 'chat');
    state = openFileTab(state, 'f1');
    expect(state.files).toEqual(['f1']);
    expect(state.active).toBe(fileTabId('f1'));
  });

  it('седьмое вложение закрывает самую давнюю НЕактивную вкладку', () => {
    let state = initialTabs('body');
    for (const id of files(MAX_FILE_TABS)) state = openFileTab(state, id);
    // f1 — свежая (вернулись к ней), давняя неактивная — f2.
    state = activateTab(state, fileTabId('f1'));
    state = openFileTab(state, 'f7');
    expect(state.files).toEqual(['f1', 'f3', 'f4', 'f5', 'f6', 'f7']);
    expect(state.visited).not.toContain(fileTabId('f2'));
    expect(state.active).toBe(fileTabId('f7'));
  });

  it('закрытие активной — к соседу слева, последней — к «Телу»', () => {
    let state = openFileTab(openFileTab(initialTabs('body'), 'f1'), 'f2');
    state = closeFileTab(state, 'f2');
    expect(state.active).toBe(fileTabId('f1'));
    state = closeFileTab(state, 'f1');
    expect(state.active).toBe('body');
    expect(state.files).toEqual([]);
  });

  it('закрытие неактивной не трогает активную; пропавшие вложения закрываются', () => {
    let state = openFileTab(openFileTab(initialTabs('body'), 'f1'), 'f2');
    state = closeFileTab(state, 'f1');
    expect(state.active).toBe(fileTabId('f2'));
    state = pruneFileTabs(state, []);
    expect(state.files).toEqual([]);
    expect(state.active).toBe('body');
  });

  it('«Текст письма» — постоянная вкладка: активируется, в файлах не живёт (редизайн #56)', () => {
    let state = activateTab(initialTabs('body'), 'text');
    expect(state.active).toBe('text');
    expect(state.visited).toEqual(['body', 'text']);
    // Не файловая: не закрывается крестиком и не занимает слот вложений.
    state = openFileTab(state, 'f1');
    expect(state.files).toEqual(['f1']);
    state = activateTab(state, 'text');
    expect(state.active).toBe('text');
    expect(closeFileTab(state, 'f1').files).toEqual([]);
    // Пропажа текстовой части — забота карточки (нормализация активной).
    expect(pruneFileTabs(state, []).active).toBe('text');
  });
});
