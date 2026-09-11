import { describe, expect, it } from 'vitest';
import type { TaskListItem } from '@nodus/contracts';

import {
  activeFiltersCount,
  applyListFilters,
  filterValueLabel,
  isActiveFilter,
  sameFilterState,
  type FilterFieldDef,
} from './list-filters.js';
import { isTaskOverdue, taskSearchText } from './task-filter-fields.js';

/** Минимальная задача для матчеров (поля вне матчей не используются). */
function task(patch: Partial<TaskListItem>): TaskListItem {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    number: 101,
    title: 'Свести каркас',
    stage: {
      id: 'st-active',
      name: 'В работе',
      order: 2,
      systemState: 'active',
      color: 'info',
    },
    personalStageId: null,
    priority: 'normal',
    deadline: null,
    creator: { id: 'u-1', displayName: 'Денис', avatarUrl: null },
    assignee: { id: 'u-2', displayName: 'Александр', avatarUrl: null },
    participants: [],
    project: null,
    parentId: null,
    spentMinutes: 0,
    commentsCount: 0,
    checklistDone: 0,
    checklistTotal: 0,
    source: 'manual',
    updatedAt: '2026-09-01T10:00:00Z',
    ...patch,
  } as TaskListItem;
}

const stageDef: FilterFieldDef<TaskListItem> = {
  id: 'stage',
  label: 'Стадия',
  type: 'select',
  options: [
    { value: 'st-active', label: 'В работе' },
    { value: 'st-done', label: 'Завершена' },
  ],
  match: (t, v) => t.stage.id === v,
};

const deadlineDef: FilterFieldDef<TaskListItem> = {
  id: 'deadline',
  label: 'Крайний срок',
  type: 'dateRange',
  match: (t, v) => {
    if (typeof v !== 'object' || v === undefined) return true;
    if (!t.deadline) return false;
    const day = t.deadline.slice(0, 10);
    if (v.from && day < v.from) return false;
    if (v.to && day > v.to) return false;
    return true;
  },
};

describe('list-filters: активность и подписи', () => {
  it('isActiveFilter: пустые значения неактивны', () => {
    expect(isActiveFilter(undefined)).toBe(false);
    expect(isActiveFilter('')).toBe(false);
    expect(isActiveFilter({})).toBe(false);
    expect(isActiveFilter('st-active')).toBe(true);
    expect(isActiveFilter({ from: '2026-09-01' })).toBe(true);
  });

  it('activeFiltersCount считает только активные поля реестра', () => {
    const defs = [stageDef, deadlineDef];
    expect(activeFiltersCount(defs, {})).toBe(0);
    expect(activeFiltersCount(defs, { stage: 'st-active' })).toBe(1);
    expect(activeFiltersCount(defs, { stage: 'st-active', deadline: { to: '2026-09-30' } })).toBe(
      2,
    );
  });

  it('filterValueLabel: select — подпись опции, диапазон — «с — по»', () => {
    expect(filterValueLabel(stageDef, 'st-done')).toBe('Завершена');
    expect(filterValueLabel(stageDef, 'unknown')).toBe('unknown');
    expect(filterValueLabel(deadlineDef, { from: '2026-09-01', to: '2026-09-30' })).toBe(
      '2026-09-01 — 2026-09-30',
    );
  });
});

describe('applyListFilters: запрос + поля', () => {
  const items = [
    task({ id: 't-1', number: 101, title: 'Свести каркас', deadline: '2026-09-13T18:00:00Z' }),
    task({
      id: 't-2',
      number: 102,
      title: 'Разработать модель',
      stage: { id: 'st-done', name: 'Завершена', order: 5, systemState: 'done', color: 'success' },
    }),
    task({ id: 't-3', number: 103, title: 'Каркас лестницы', deadline: null }),
  ];

  it('без запроса и фильтров — весь список', () => {
    expect(applyListFilters(items, [stageDef], {}, '', taskSearchText)).toHaveLength(3);
  });

  it('поиск по подстроке без регистра (название и номер)', () => {
    const byTitle = applyListFilters(items, [stageDef], {}, 'КАРКАС', taskSearchText);
    expect(byTitle.map((t) => t.id)).toEqual(['t-1', 't-3']);
    const byNumber = applyListFilters(items, [stageDef], {}, '102', taskSearchText);
    expect(byNumber.map((t) => t.id)).toEqual(['t-2']);
  });

  it('фильтр по стадии + поиск работают вместе (AND)', () => {
    const result = applyListFilters(
      items,
      [stageDef],
      { stage: 'st-active' },
      'каркас',
      taskSearchText,
    );
    expect(result.map((t) => t.id)).toEqual(['t-1', 't-3']);
  });

  it('диапазон дат: from/to включительно, без срока — мимо', () => {
    const result = applyListFilters(
      items,
      [deadlineDef],
      { deadline: { from: '2026-09-01', to: '2026-09-13' } },
      '',
      taskSearchText,
    );
    expect(result.map((t) => t.id)).toEqual(['t-1']);
  });

  it('поле без значения в state не фильтрует', () => {
    expect(
      applyListFilters(items, [stageDef], { stage: undefined }, '', taskSearchText),
    ).toHaveLength(3);
  });
});

describe('sameFilterState: подсветка активного пресета', () => {
  it('одинаковые активные значения — равны, порядок ключей не важен', () => {
    expect(sameFilterState({ stage: 'a', role: 'r' }, { role: 'r', stage: 'a' })).toBe(true);
  });

  it('пустые значения игнорируются', () => {
    expect(sameFilterState({ stage: 'a', role: '' }, { stage: 'a' })).toBe(true);
    expect(sameFilterState({}, { stage: undefined })).toBe(true);
  });

  it('разные значения или наборы — не равны', () => {
    expect(sameFilterState({ stage: 'a' }, { stage: 'b' })).toBe(false);
    expect(sameFilterState({ stage: 'a' }, { stage: 'a', role: 'r' })).toBe(false);
  });

  it('диапазоны дат сравниваются по from/to', () => {
    expect(
      sameFilterState(
        { deadline: { from: '2026-09-01', to: '2026-09-30' } },
        { deadline: { from: '2026-09-01', to: '2026-09-30' } },
      ),
    ).toBe(true);
    expect(
      sameFilterState({ deadline: { from: '2026-09-01' } }, { deadline: { to: '2026-09-01' } }),
    ).toBe(false);
  });
});

describe('isTaskOverdue: просрочка задачи', () => {
  const now = new Date('2026-09-11T12:00:00Z').getTime();

  it('дедлайн в прошлом и не завершена — просрочена', () => {
    expect(isTaskOverdue(task({ deadline: '2026-09-10T18:00:00Z' }), now)).toBe(true);
  });

  it('дедлайн в будущем — не просрочена', () => {
    expect(isTaskOverdue(task({ deadline: '2026-09-13T18:00:00Z' }), now)).toBe(false);
  });

  it('без дедлайна — не просрочена', () => {
    expect(isTaskOverdue(task({ deadline: null }), now)).toBe(false);
  });

  it('завершённая с дедлайном в прошлом — НЕ просрочена', () => {
    expect(
      isTaskOverdue(
        task({
          deadline: '2026-09-01T18:00:00Z',
          stage: {
            id: 'st-done',
            name: 'Завершена',
            order: 5,
            systemState: 'done',
            color: 'success',
          },
        }),
        now,
      ),
    ).toBe(false);
  });
});
