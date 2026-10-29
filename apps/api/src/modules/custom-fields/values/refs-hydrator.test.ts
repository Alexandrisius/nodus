import { describe, expect, it, vi } from 'vitest';
import type { CustomFieldDefinition } from '@nodus/contracts';

import { CustomFieldRefsHydrator } from './refs-hydrator.js';

/**
 * Гидратор ссылок (#431, Р6): карточка получает имена сотрудников,
 * подразделений, вариантов и контрагентов одним набором пачек; архивные
 * помечаются; имя проекта — только видимое актёру (#52 Р13).
 */

const definition = (
  overrides: Partial<CustomFieldDefinition> & Pick<CustomFieldDefinition, 'id' | 'type'>,
): CustomFieldDefinition =>
  ({
    scope: 'task',
    name: 'Поле',
    hint: null,
    settings: {},
    dictionary: null,
    defaultValue: null,
    defaultRefs: [],
    reportIndexed: false,
    hidden: false,
    sortOrder: 0,
    createdAt: '2026-10-26T00:00:00.000Z',
    updatedAt: '2026-10-26T00:00:00.000Z',
    ...overrides,
  }) as CustomFieldDefinition;

const USER = '11111111-1111-4111-8111-111111111111';
const RETIRED = '22222222-2222-4222-8222-222222222222';
const DEPARTMENT = '33333333-3333-4333-8333-333333333333';
const ITEM = '44444444-4444-4444-8444-444444444444';
const BYN = '55555555-5555-4555-8555-555555555555';
const COUNTERPARTY = '66666666-6666-4666-8666-666666666666';
const PROJECT = '77777777-7777-4777-8777-777777777777';
const ACTOR = { id: 'u-1', permissions: [] as string[] };

function makeHydrator() {
  const users = {
    findRefs: vi.fn(async (ids: string[]) =>
      ids.map((id) => ({
        id,
        displayName: `Сотрудник ${id.slice(0, 4)}`,
        avatarUrl: id === USER ? 'https://example.test/a.png' : null,
      })),
    ),
    filterActiveUserIds: vi.fn(async (ids: string[]) => ids.filter((id) => id !== RETIRED)),
    searchByDisplayName: vi.fn(),
  };
  const org = {
    subordinateIds: vi.fn(),
    departmentOf: vi.fn(),
    departmentRefs: vi.fn(async (ids: string[]) =>
      ids.map((id) => ({ id, name: `Отдел ${id.slice(0, 4)}`, isActive: true })),
    ),
  };
  const dictionaries = {
    dictionaryRefs: vi.fn(),
    itemRefs: vi.fn(async (ids: string[]) =>
      ids.map((id) => ({
        id,
        dictionaryId: 'dict-1',
        name: `Вариант ${id.slice(0, 4)}`,
        isActive: id !== ITEM,
      })),
    ),
    activeItemRef: vi.fn(),
  };
  const counterparties = {
    refs: vi.fn(async (ids: string[]) => ids.map((id) => ({ id, name: 'ООО «Проба»' }))),
    activeRef: vi.fn(async (id: string) => ({ id, name: 'ООО «Проба»' })),
  };
  const projects = {
    refsFor: vi.fn(async (_actor: unknown, ids: string[]) =>
      ids.map((id) => ({ id, code: '2026-1', name: 'Тендер УП', color: 'blue' })),
    ),
  };
  const hydrator = new CustomFieldRefsHydrator(
    users as never,
    org as never,
    dictionaries as never,
    counterparties as never,
    projects as never,
  );
  return { hydrator, users, counterparties, projects };
}

describe('CustomFieldRefsHydrator (#431, Р6)', () => {
  it('сотрудники: имя и аватар, деактивированный — archived', async () => {
    const { hydrator } = makeHydrator();
    const refs = await hydrator.hydrate(
      [definition({ id: 'f-users', type: 'users' })],
      {
        'f-users': [USER, RETIRED],
      },
      ACTOR,
    );
    expect(refs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'user', id: USER, archived: false }),
        expect.objectContaining({ kind: 'user', id: RETIRED, archived: true }),
      ]),
    );
    expect(refs.find((ref) => ref.id === USER)?.avatarUrl).toBe('https://example.test/a.png');
  });

  it('деньги приносят валюту как ссылку словаря: имя для суммы', async () => {
    const { hydrator } = makeHydrator();
    const refs = await hydrator.hydrate(
      [definition({ id: 'f-money', type: 'money', settings: { currencyId: BYN } })],
      { 'f-money': { amount: 10, currencyId: BYN } },
      ACTOR,
    );
    expect(refs).toEqual([
      expect.objectContaining({ kind: 'dictionary_item', id: BYN, archived: false }),
    ]);
  });

  it('архивный вариант справочника помечен archived', async () => {
    const { hydrator } = makeHydrator();
    const refs = await hydrator.hydrate(
      [definition({ id: 'f-enum', type: 'enum', settings: { dictionaryId: 'dict-1' } })],
      { 'f-enum': ITEM },
      ACTOR,
    );
    expect(refs[0]).toMatchObject({ kind: 'dictionary_item', archived: true });
  });

  it('проект: имя из порта проектов; без актёра — «Запись недоступна»', async () => {
    const { hydrator, projects } = makeHydrator();
    const refs = await hydrator.hydrate(
      [definition({ id: 'f-project', type: 'project' })],
      {
        'f-project': PROJECT,
      },
      ACTOR,
    );
    expect(refs).toEqual([
      { kind: 'project', id: PROJECT, name: 'Тендер УП', avatarUrl: null, archived: false },
    ]);
    expect(projects.refsFor).toHaveBeenCalledWith(ACTOR, [PROJECT]);

    // Служебный вызов без актёра — имя скрыто, значение не теряется.
    const withoutActor = await hydrator.hydrate(
      [definition({ id: 'f-project', type: 'project' })],
      { 'f-project': PROJECT },
      undefined,
    );
    expect(withoutActor).toEqual([
      { kind: 'project', id: PROJECT, name: null, avatarUrl: null, archived: false },
    ]);
  });

  it('пустые значения пропускаются, дубли не повторяются', async () => {
    const { hydrator, counterparties } = makeHydrator();
    const refs = await hydrator.hydrate(
      [
        definition({ id: 'f-cp', type: 'counterparty' }),
        definition({ id: 'f-text', type: 'text' }),
      ],
      { 'f-cp': COUNTERPARTY, 'f-text': '  ' },
      ACTOR,
    );
    expect(refs).toEqual([expect.objectContaining({ kind: 'counterparty', id: COUNTERPARTY })]);
    expect(counterparties.refs).toHaveBeenCalledWith([COUNTERPARTY]);
  });

  it('подразделение: имя из порта оргструктуры', async () => {
    const { hydrator } = makeHydrator();
    const refs = await hydrator.hydrate(
      [definition({ id: 'f-dep', type: 'department' })],
      {
        'f-dep': DEPARTMENT,
      },
      ACTOR,
    );
    expect(refs[0]).toMatchObject({ kind: 'department', id: DEPARTMENT, archived: false });
  });
});
