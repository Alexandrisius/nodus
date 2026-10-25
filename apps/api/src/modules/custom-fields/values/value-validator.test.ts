import { describe, expect, it, vi } from 'vitest';
import type { CustomFieldDefinition } from '@nodus/contracts';

import { CustomFieldValueValidator } from './value-validator.js';

/**
 * Валидатор значений (#431, Р2): каждая причина отказа — отдельный кейс.
 * Порты-источники ссылок — моки: юнит не ходит в БД (ADR-0012).
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
const CLOSED_DEPARTMENT = '44444444-4444-4444-8444-444444444444';
const DICTIONARY = '55555555-5555-4555-8555-555555555555';
const ITEM = '66666666-6666-4666-8666-666666666666';
const ARCHIVED_ITEM = '77777777-7777-4777-8777-777777777777';
const CURRENCY_DICTIONARY = '88888888-8888-4888-8888-888888888888';
const BYN = '99999999-9999-4999-8999-999999999999';
const COUNTERPARTY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function makeValidator(opts: { activeCounterparties?: string[] } = {}) {
  const users = {
    findRefs: vi.fn(async (ids: string[]) =>
      ids
        .filter((id) => id === USER || id === RETIRED)
        .map((id) => ({ id, displayName: `Сотрудник ${id.slice(0, 4)}`, avatarUrl: null })),
    ),
    filterActiveUserIds: vi.fn(async (ids: string[]) => ids.filter((id) => id === USER)),
    searchByDisplayName: vi.fn(),
  };
  const org = {
    subordinateIds: vi.fn(),
    departmentOf: vi.fn(),
    departmentRefs: vi.fn(async (ids: string[]) =>
      ids
        .filter((id) => id === DEPARTMENT || id === CLOSED_DEPARTMENT)
        .map((id) => ({ id, name: `Отдел ${id.slice(0, 4)}`, isActive: id === DEPARTMENT })),
    ),
  };
  const dictionaries = {
    dictionaryRefs: vi.fn(async (ids: string[]) =>
      ids
        .filter((id) => id === DICTIONARY || id === CURRENCY_DICTIONARY)
        .map((id) => ({
          id,
          code: id === CURRENCY_DICTIONARY ? 'currency' : 'list-00000001',
          name: 'Список',
          isSystem: id === CURRENCY_DICTIONARY,
        })),
    ),
    itemRefs: vi.fn(async (ids: string[]) =>
      ids
        .filter((id) => id === ITEM || id === ARCHIVED_ITEM || id === BYN)
        .map((id) => ({
          id,
          dictionaryId: id === BYN ? CURRENCY_DICTIONARY : DICTIONARY,
          name: `Вариант ${id.slice(0, 4)}`,
          isActive: id !== ARCHIVED_ITEM,
        })),
    ),
    activeItemRef: vi.fn(),
  };
  const counterparties = {
    refs: vi.fn(async () => []),
    activeRef: vi.fn(async (id: string) =>
      (opts.activeCounterparties ?? [COUNTERPARTY]).includes(id)
        ? { id, name: 'Контрагент' }
        : null,
    ),
  };
  const validator = new CustomFieldValueValidator(
    users as never,
    org as never,
    dictionaries as never,
    counterparties as never,
  );
  return { validator, users, org, dictionaries, counterparties };
}

describe('CustomFieldValueValidator (#431)', () => {
  it('неизвестное поле и чужой тип — unknown/invalid без обращения к портам', async () => {
    const { validator, users } = makeValidator();
    const text = definition({ id: 'f-text', type: 'text' });
    const issues = await validator.validate('task', [text], {
      'f-unknown': 'x',
      'f-text': 42,
    } as never);
    expect(issues).toEqual([
      { fieldId: 'f-unknown', reason: 'unknown', message: 'Unknown custom field' },
      { fieldId: 'f-text', reason: 'invalid', message: 'Value does not match field type' },
    ]);
    expect(users.findRefs).not.toHaveBeenCalled();
  });

  it('поле другой области — unknown: области не пересекаются', async () => {
    const { validator } = makeValidator();
    const letterField = definition({ id: 'f-letter', type: 'text', scope: 'letter' });
    const issues = await validator.validate('task', [letterField], { 'f-letter': 'x' });
    expect(issues[0]?.reason).toBe('unknown');
  });

  it('сотрудник: отсутствует — not_found, деактивирован — inactive', async () => {
    const { validator } = makeValidator();
    const user = definition({ id: 'f-user', type: 'user' });
    const users = definition({ id: 'f-users', type: 'users' });

    expect(
      (
        await validator.validate('task', [user], {
          'f-user': 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        })
      )[0]?.reason,
    ).toBe('not_found');
    expect((await validator.validate('task', [user], { 'f-user': RETIRED }))[0]?.reason).toBe(
      'inactive',
    );
    expect(await validator.validate('task', [user], { 'f-user': USER })).toEqual([]);
    expect(await validator.validate('task', [users], { 'f-users': [USER] })).toEqual([]);
    // Один деактивированный в пачке — отказ: новый выбор только активные.
    expect(
      (await validator.validate('task', [users], { 'f-users': [USER, RETIRED] }))[0]?.reason,
    ).toBe('inactive');
  });

  it('подразделение: архивное — inactive', async () => {
    const { validator } = makeValidator();
    const department = definition({ id: 'f-dep', type: 'department' });
    expect(
      (await validator.validate('task', [department], { 'f-dep': CLOSED_DEPARTMENT }))[0]?.reason,
    ).toBe('inactive');
    expect(await validator.validate('task', [department], { 'f-dep': DEPARTMENT })).toEqual([]);
  });

  it('список: вариант чужого справочника — not_found, архивный — inactive', async () => {
    const { validator } = makeValidator();
    const list = definition({
      id: 'f-list',
      type: 'enum',
      settings: { dictionaryId: DICTIONARY },
    });
    const other = definition({
      id: 'f-other',
      type: 'multienum',
      settings: { dictionaryId: CURRENCY_DICTIONARY },
    });
    expect((await validator.validate('task', [list], { 'f-list': ARCHIVED_ITEM }))[0]?.reason).toBe(
      'inactive',
    );
    expect((await validator.validate('task', [other], { 'f-other': [ITEM] }))[0]?.reason).toBe(
      'not_found',
    );
    expect(await validator.validate('task', [list], { 'f-list': ITEM })).toEqual([]);
  });

  it('деньги: валюта только из системного справочника currency', async () => {
    const { validator } = makeValidator();
    const money = definition({ id: 'f-money', type: 'money', settings: { currencyId: BYN } });
    expect(
      await validator.validate('task', [money], { 'f-money': { amount: 10, currencyId: BYN } }),
    ).toEqual([]);
    // Элемент другого справочника — не валюта.
    expect(
      (
        await validator.validate('task', [money], {
          'f-money': { amount: 10, currencyId: ITEM },
        })
      )[0]?.reason,
    ).toBe('not_found');
  });

  it('контрагент: архивный или отсутствующий — not_found (порт отдаёт только действующих)', async () => {
    const { validator } = makeValidator({ activeCounterparties: [] });
    const counterparty = definition({ id: 'f-cp', type: 'counterparty' });
    const issues = await validator.validate('task', [counterparty], { 'f-cp': COUNTERPARTY });
    expect(issues[0]?.reason).toBe('not_found');
  });

  it('проект до #52 — not_found: значение принять некуда', async () => {
    const { validator } = makeValidator();
    const project = definition({ id: 'f-project', type: 'project' });
    const issues = await validator.validate('task', [project], { 'f-project': COUNTERPARTY });
    expect(issues[0]?.reason).toBe('not_found');
  });

  it('больше 50 ключей — отказ без обращения к портам', async () => {
    const { validator, users } = makeValidator();
    const values = Object.fromEntries(
      Array.from({ length: 51 }, (_, index) => [`f-${index}`, 'x']),
    );
    const issues = await validator.validate('task', [], values as never);
    expect(issues[0]?.reason).toBe('invalid');
    expect(users.findRefs).not.toHaveBeenCalled();
  });
});
