// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: vi.fn() }));

import { toast } from 'sonner';

import { useSelectionStore } from './selection-store.js';
import {
  exitedBoundary,
  pressKind,
  rowAt,
  selectableRowAt,
  sliceRange,
} from './use-box-selection.js';

/** Рамочное выделение (#132 р.7 — модель Telegram webk + идентификаторные
 *  диапазоны): решение старта по цели (pressKind), геометрия выхода за
 *  поверхность, строка по координате (rowAt) и аккумуляция applySet. */

beforeEach(() => {
  vi.mocked(toast).mockClear();
  useSelectionStore.setState({ scope: null, ids: [], anchorId: null });
});

describe('sliceRange (непрерывный диапазон «резинки»)', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  it('прямой и обратный порядок — один диапазон', () => {
    expect(sliceRange(ids, 1, 3)).toEqual(['b', 'c', 'd']);
    expect(sliceRange(ids, 3, 1)).toEqual(['b', 'c', 'd']);
  });
  it('клампится в границы списка', () => {
    expect(sliceRange(ids, -2, 2)).toEqual(['a', 'b', 'c']);
    expect(sliceRange(ids, 3, 99)).toEqual(['d', 'e']);
  });
  it('пустой список — пустой диапазон', () => {
    expect(sliceRange([], 0, 5)).toEqual([]);
  });
});

describe('rowAt (строка под координатой y — сама строка, не DOM-индекс)', () => {
  function rowsAt(...tops: number[]): HTMLElement[] {
    return tops.map((top, i) => {
      const el = document.createElement('div');
      el.dataset.messageId = `m${i}`;
      vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, top, 100, 40));
      return el;
    });
  }

  it('последняя строка, чей верх выше y; выше всех → первая; ниже всех → последняя', () => {
    const rows = rowsAt(0, 50, 100, 150);
    expect(rowAt(rows, 60)?.dataset.messageId).toBe('m1');
    expect(rowAt(rows, 999)?.dataset.messageId).toBe('m3');
    expect(rowAt(rows, -10)?.dataset.messageId).toBe('m0');
    expect(rowAt([], 10)).toBeNull();
  });

  it('р.7: окно DOM ≠ лента — rowAt не зависит от индексов окна (виртуализация)', () => {
    // В DOM только «окно» строк 50..53 ленты из 200 — диапазон строят
    // id через indexOf, DOM-порядок окна не смещает выбор.
    const win = rowsAt(0, 50, 100, 150).map((el, i) => {
      el.dataset.messageId = `m${50 + i}`;
      return el;
    });
    expect(rowAt(win, 60)?.dataset.messageId).toBe('m51');
  });
});

describe('selectableRowAt (р.8: надгробия — отдельное пространство, #164)', () => {
  function rowsAt(...specs: Array<[id: string, top: number]>): HTMLElement[] {
    return specs.map(([id, top]) => {
      const el = document.createElement('div');
      el.dataset.messageId = id;
      vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, top, 100, 40));
      return el;
    });
  }

  it('курсор на надгробии — null: соседнее живое сообщение не втягивается', () => {
    const rows = rowsAt(['a', 0], ['t', 50], ['c', 100]);
    expect(selectableRowAt(rows, ['a', 'c'], 60)).toBeNull();
    expect(selectableRowAt(rows, ['a', 'c'], 90)).toBeNull();
  });

  it('курсор на живой строке — она сама', () => {
    const rows = rowsAt(['a', 0], ['t', 50], ['c', 100]);
    expect(selectableRowAt(rows, ['a', 'c'], 20)?.dataset.messageId).toBe('a');
    expect(selectableRowAt(rows, ['a', 'c'], 120)?.dataset.messageId).toBe('c');
  });

  it('пустота над лентой, первая строка — надгробие → null (его зона, не сосед)', () => {
    const rows = rowsAt(['t', 50], ['a', 100]);
    expect(selectableRowAt(rows, ['a'], 10)).toBeNull();
  });

  it('пустое подножье под надгробием-последней → последняя выбираемая (р.7)', () => {
    const rows = rowsAt(['a', 0], ['t', 50]);
    expect(selectableRowAt(rows, ['a'], 200)?.dataset.messageId).toBe('a');
  });

  it('все строки — надгробия → null (рамке не за что зацепиться)', () => {
    const rows = rowsAt(['t1', 0], ['t2', 50]);
    expect(selectableRowAt(rows, ['x'], 20)).toBeNull();
    expect(selectableRowAt(rows, ['x'], 200)).toBeNull();
  });
});

describe('pressKind (модель Telegram webk, р.6: старт по цели нажатия)', () => {
  /** DOM строки: row > [кружок] > обёртка > (bubble[data-variant] >
   *  message-text | фон обёртки); пост — post-surface вместо bubble. */
  function feedDom() {
    const row = document.createElement('div');
    row.dataset.messageId = 'm1';
    const wrapper = document.createElement('div');
    const bubble = document.createElement('div');
    bubble.setAttribute('data-variant', 'card');
    const text = document.createElement('span');
    text.setAttribute('data-slot', 'message-text');
    const meta = document.createElement('span');
    bubble.append(text, meta);
    wrapper.append(bubble);
    row.append(wrapper);
    const circle = document.createElement('button');
    row.append(circle);
    return { row, wrapper, bubble, text, meta, circle };
  }

  it('старт НА ТЕКСТЕ → нативное выделение (рамка лишь при выходе за поверхность)', () => {
    const { text } = feedDom();
    expect(pressKind(text, false)).toBe('text');
  });

  it('старт «на строке» (поля/фон/аватар) → рамка: миллиметр у края достаточен', () => {
    const { row, wrapper } = feedDom();
    expect(pressKind(wrapper, false)).toBe('box'); // фон обёртки = вся ширина строки
    expect(pressKind(row, false)).toBe('box');
  });

  it('контент поверхности ВНЕ режима (медиа/мета) — НЕ рамка, живут своими жестами', () => {
    const { meta, bubble } = feedDom();
    expect(pressKind(meta, false)).toBe('none');
    expect(pressKind(bubble, false)).toBe('none');
  });

  it('в режиме селекта рамка тянется ОТКУДА УГОДНО — текст и КРУЖКИ включают её', () => {
    const { text, circle, meta } = feedDom();
    expect(pressKind(text, true)).toBe('box');
    expect(pressKind(circle, true)).toBe('box');
    expect(pressKind(meta, true)).toBe('box');
  });

  it('вне строк: пустое место ленты — РАМКА (р.7); хром-контролы и поля ввода — нет', () => {
    const empty = document.createElement('div');
    expect(pressKind(empty, false)).toBe('box'); // фон/подножье ленты
    expect(pressKind(empty, true)).toBe('box');
    const button = document.createElement('button'); // стрелка прокрутки и пр.
    expect(pressKind(button, false)).toBe('none');
    expect(pressKind(button, true)).toBe('box'); // в режиме селекта — откуда угодно
    const { row } = feedDom();
    const input = document.createElement('input');
    row.append(input);
    expect(pressKind(input, false)).toBe('none');
    expect(pressKind(input, true)).toBe('none');
  });

  it('пост канала: текст → натив, карточка вне режима — не рамка, поля — рамка', () => {
    const row = document.createElement('div');
    row.dataset.messageId = 'p1';
    const card = document.createElement('div');
    card.setAttribute('data-slot', 'post-surface');
    const text = document.createElement('span');
    text.setAttribute('data-slot', 'message-text');
    card.append(text);
    const wrapper = document.createElement('div');
    wrapper.append(card);
    row.append(wrapper);
    expect(pressKind(text, false)).toBe('text');
    expect(pressKind(card, false)).toBe('none');
    expect(pressKind(wrapper, false)).toBe('box');
    expect(pressKind(text, true)).toBe('box');
  });
});

describe('exitedBoundary (выход текста за поверхность → весь пузырь)', () => {
  const rect = new DOMRect(100, 200, 300, 80); // правый край 400, низ 280

  it('внутри и на краю — ещё текстовое выделение', () => {
    expect(exitedBoundary(rect, 250, 240)).toBe(false);
    expect(exitedBoundary(rect, 401, 240)).toBe(false); // запас 2px
  });

  it('выход любой стороной — рамка', () => {
    expect(exitedBoundary(rect, 405, 240)).toBe(true); // правее пузыря
    expect(exitedBoundary(rect, 95, 240)).toBe(true); // левее
    expect(exitedBoundary(rect, 250, 285)).toBe(true); // ниже
    expect(exitedBoundary(rect, 250, 195)).toBe(true); // выше
  });
});

describe('applySet (#132 р.3: рамка АККУМУЛИРУЕТ выделение)', () => {
  it('пустой набор — режим не трогает', () => {
    useSelectionStore.getState().enter('conversation:x', 'm1');
    useSelectionStore.getState().applySet('conversation:x', []);
    expect(useSelectionStore.getState().ids).toEqual(['m1']);
  });

  it('первый непустой набор входит в режим, якорь — первый id', () => {
    useSelectionStore.getState().applySet('conversation:x', ['m2', 'm3']);
    const s = useSelectionStore.getState();
    expect(s.scope).toBe('conversation:x');
    expect(s.ids).toEqual(['m2', 'm3']);
    expect(s.anchorId).toBe('m2');
  });

  it('вторая пачка ДОБАВЛЯЕТСЯ, прежнее выделение не снимается (union)', () => {
    useSelectionStore.getState().applySet('conversation:x', ['m2', 'm3']);
    useSelectionStore.getState().applySet('conversation:x', ['m5']);
    expect(useSelectionStore.getState().ids).toEqual(['m2', 'm3', 'm5']);
    // Частичное пересечение — без дублей.
    useSelectionStore.getState().applySet('conversation:x', ['m3', 'm9']);
    expect(useSelectionStore.getState().ids).toEqual(['m2', 'm3', 'm5', 'm9']);
  });

  it('неизменный состав — стор молчит (без ряби рендера, лаги р.3)', () => {
    useSelectionStore.getState().applySet('conversation:x', ['m2', 'm3']);
    const before = useSelectionStore.getState();
    useSelectionStore.getState().applySet('conversation:x', ['m3', 'm2']);
    expect(useSelectionStore.getState()).toBe(before); // тот же объект
  });

  it('лимит 100 — обрезка с явным тостом', () => {
    const ids = Array.from({ length: 130 }, (_, i) => `m${i}`);
    useSelectionStore.getState().applySet('conversation:x', ids);
    expect(useSelectionStore.getState().ids).toHaveLength(100);
    expect(toast).toHaveBeenCalledTimes(1);
  });
});
