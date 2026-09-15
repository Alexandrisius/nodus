// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { useUiPrefsStore } from './ui-prefs-store.js';
import { useViewStore } from '../../shared/views/view-store.js';

/**
 * Сторы персонализации (аудит #45): скоупы applyNav/resetPersonal и
 * КРИТИЧНЫЙ урок — applyOrder НЕ насилует видимость (скрытые по умолчанию
 * поля воскресали на первом drag колонки, 15.09.2026). Плюс zod-валидация
 * rehydrate: битая форма сохранённого — молчаливый дефолт, не белый экран.
 */
beforeEach(() => {
  localStorage.clear();
  useUiPrefsStore.setState({ personal: {}, company: {} });
  useViewStore.setState({ views: {}, sorts: {} });
});

describe('ui-prefs-store: скоупы навигации', () => {
  it('applyNav без forAll пишет ЛИЧНЫЙ скоуп, общий не трогает', () => {
    useUiPrefsStore.getState().applyNav(['tasks', 'home'], ['chat'], false);
    const s = useUiPrefsStore.getState();
    expect(s.personal.navOrder).toEqual(['tasks', 'home']);
    expect(s.personal.navHidden).toEqual(['chat']);
    expect(s.company.navOrder).toBeUndefined();
  });

  it('applyNav с forAll («Применить для всех», админ) пишет ОБЩИЙ скоуп', () => {
    useUiPrefsStore.getState().applyNav(['chat', 'home'], [], true);
    const s = useUiPrefsStore.getState();
    expect(s.company.navOrder).toEqual(['chat', 'home']);
    expect(s.personal.navOrder).toBeUndefined();
  });

  it('resetPersonal сбрасывает только личный слой (общий остаётся)', () => {
    useUiPrefsStore.getState().applyNav(['tasks'], [], true);
    useUiPrefsStore.getState().applyNav(['home'], ['letters'], false);
    useUiPrefsStore.getState().resetPersonal();
    const s = useUiPrefsStore.getState();
    expect(s.personal).toEqual({});
    expect(s.company.navOrder).toEqual(['tasks']);
  });

  it('rehydrate: валидная форма восстанавливается', async () => {
    localStorage.setItem(
      'nodus-ui-prefs-v1',
      JSON.stringify({ state: { personal: { navOrder: ['chat'] }, company: {} }, version: 1 }),
    );
    await useUiPrefsStore.persist.rehydrate();
    expect(useUiPrefsStore.getState().personal.navOrder).toEqual(['chat']);
  });

  it('rehydrate: БИТАЯ ФОРМА (navOrder строкой — краш аудита #45) → дефолт скоупа, соседний цел', async () => {
    localStorage.setItem(
      'nodus-ui-prefs-v1',
      JSON.stringify({
        state: { personal: { navOrder: 'строка вместо массива' }, company: { navOrder: ['home'] } },
        version: 1,
      }),
    );
    await useUiPrefsStore.persist.rehydrate();
    const s = useUiPrefsStore.getState();
    // Сломанный личный скоуп отброшен на {}, общий выжил.
    expect(s.personal).toEqual({});
    expect(s.company.navOrder).toEqual(['home']);
  });

  it('rehydrate: не-объект целиком → дефолт', async () => {
    localStorage.setItem('nodus-ui-prefs-v1', JSON.stringify({ state: 'бито', version: 1 }));
    await useUiPrefsStore.persist.rehydrate();
    expect(useUiPrefsStore.getState().personal).toEqual({});
  });
});

describe('view-store: порядок колонок и видимость', () => {
  it('applyOrder сохраняет ТЕКУЩУЮ видимость из entries (урок воскресающих скрытых полей)', () => {
    // Поле hidden-by-default: в пресете visible:false; drag-коммит несёт его
    // с visible:false — после applyOrder оно ОБЯЗАНО остаться скрытым.
    useViewStore.getState().setFieldVisible('tasks.list', 'creator', false);
    useViewStore.getState().applyOrder('tasks.list', [
      { id: 'title', visible: true },
      { id: 'creator', visible: false },
    ]);
    expect(useViewStore.getState().views['tasks.list']?.['creator']?.visible).toBe(false);
    expect(useViewStore.getState().views['tasks.list']?.['title']?.visible).toBe(true);
  });

  it('applyOrder пишет order по позиции, ширину не затирает', () => {
    useViewStore.getState().setFieldWidth('tasks.list', 'title', 460);
    useViewStore.getState().applyOrder('tasks.list', [
      { id: 'number', visible: true },
      { id: 'title', visible: true },
    ]);
    const prefs = useViewStore.getState().views['tasks.list'];
    expect(prefs?.['number']?.order).toBe(0);
    expect(prefs?.['title']?.order).toBe(1);
    expect(prefs?.['title']?.width).toBe(460);
  });

  it('resetView чистит и views, и sorts вида', () => {
    useViewStore.getState().setFieldVisible('tasks.list', 'creator', false);
    useViewStore.getState().setSort('tasks.list', { field: 'title', dir: 'asc' });
    useViewStore.getState().resetView('tasks.list');
    const s = useViewStore.getState();
    expect(s.views['tasks.list']).toBeUndefined();
    expect(s.sorts['tasks.list']).toBeUndefined();
  });

  it('rehydrate: битый вид отбрасывается, соседний выживает', async () => {
    localStorage.setItem(
      'nodus-views-v1',
      JSON.stringify({
        state: {
          views: {
            'tasks.list': 'бито',
            'letters.journal': { title: { visible: true, order: 0 } },
          },
          sorts: {},
        },
        version: 1,
      }),
    );
    await useViewStore.persist.rehydrate();
    const s = useViewStore.getState();
    expect(s.views['tasks.list']).toEqual({});
    expect(s.views['letters.journal']?.['title']?.order).toBe(0);
  });
});
