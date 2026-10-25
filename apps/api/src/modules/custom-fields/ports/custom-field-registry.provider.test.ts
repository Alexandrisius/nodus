import { describe, expect, it, vi } from 'vitest';
import type { CustomFieldDefinition } from '@nodus/contracts';
import { ErrorCode } from '@nodus/contracts';

import type { CustomFieldIssue } from '../values/value-validator.js';
import { CustomFieldRegistryProvider, invalidValues } from './custom-field-registry.provider.js';

/**
 * Порт реестра (#431, Р2/Р5): единственная точка динамической валидации.
 * Проверяются: слияние умолчаний с вводом (ввод важнее), проверка только
 * изменённых значений, `null` удаляет ключ, стабильное сравнение JSONB-карт.
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

const BYN = '99999999-9999-4999-8999-999999999999';

function makeRegistry(definitions: CustomFieldDefinition[]) {
  const repository = { list: vi.fn(async () => []) };
  const mapper = { toDtos: vi.fn(async () => definitions), toDto: vi.fn() };
  const validator = { validate: vi.fn(async (): Promise<CustomFieldIssue[]> => []) };
  const defaults = { resolve: vi.fn(async () => ({})) };
  const hydrator = { hydrate: vi.fn(async () => []) };
  const logger = { setContext: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const registry = new CustomFieldRegistryProvider(
    repository as never,
    mapper as never,
    validator as never,
    defaults as never,
    hydrator as never,
    logger as never,
  );
  return { registry, validator, defaults, mapper, hydrator };
}

describe('CustomFieldRegistry.prepareCreate (#431, Р5)', () => {
  it('умолчания + ввод: явное значение важнее умолчания', async () => {
    const definitions = [
      definition({
        id: 'f-a',
        type: 'text',
        defaultValue: { kind: 'static', value: 'из умолчания' },
      }),
      definition({ id: 'f-b', type: 'text', defaultValue: { kind: 'static', value: 'второе' } }),
    ];
    const { registry, defaults } = makeRegistry(definitions);
    defaults.resolve.mockResolvedValue({ 'f-a': 'из умолчания', 'f-b': 'второе' });
    const values = await registry.prepareCreate('task', {
      input: { 'f-a': 'явное' },
      authorId: 'author-1',
    });
    expect(values).toEqual({ 'f-a': 'явное', 'f-b': 'второе' });
  });

  it('умолчание с недействительной ссылкой отбрасывается, создание продолжается', async () => {
    const definitions = [definition({ id: 'f-a', type: 'user', defaultValue: null })];
    const { registry, defaults, validator } = makeRegistry(definitions);
    defaults.resolve.mockResolvedValue({ 'f-a': 'bad-user' });
    // Первый вызов — умолчания (есть отказ), второй — ввод (чисто).
    validator.validate.mockResolvedValueOnce([
      { fieldId: 'f-a', reason: 'inactive', message: 'User is deactivated' },
    ]);
    const values = await registry.prepareCreate('task', { input: {}, authorId: 'author-1' });
    expect(values).toEqual({});
  });

  it('без определений области любой ввод — unknown (422)', async () => {
    const { registry } = makeRegistry([]);
    await expect(
      registry.prepareCreate('task', { input: { 'f-x': 'v' }, authorId: 'author-1' }),
    ).rejects.toMatchObject({
      code: ErrorCode.CUSTOM_FIELD_VALUE_INVALID,
      details: { issues: [{ fieldId: 'f-x', reason: 'unknown' }] },
    });
  });
});

describe('CustomFieldRegistry.prepareUpdate (#431, Р1/Р2)', () => {
  it('null удаляет ключ, незаполненное не хранится', async () => {
    const { registry } = makeRegistry([definition({ id: 'f-a', type: 'text' })]);
    const { next, changes } = await registry.prepareUpdate('task', {
      current: { 'f-a': 'старое', 'f-b': 'остаётся' },
      patch: { 'f-a': null },
    });
    expect(next).toEqual({ 'f-b': 'остаётся' });
    expect(changes).toEqual([{ fieldId: 'f-a', from: 'старое', to: null }]);
  });

  it('проверяются только изменённые значения', async () => {
    const { registry, validator } = makeRegistry([definition({ id: 'f-a', type: 'text' })]);
    await registry.prepareUpdate('task', {
      current: { 'f-a': 'то же' },
      patch: { 'f-a': 'то же' },
    });
    expect(validator.validate).toHaveBeenCalledWith('task', expect.anything(), {}, undefined);
  });

  it('деньги сравниваются по содержимому: порядок ключей JSONB не важен', async () => {
    const { registry, validator } = makeRegistry([
      definition({ id: 'f-money', type: 'money', settings: { currencyId: BYN } }),
    ]);
    const { next, changes } = await registry.prepareUpdate('task', {
      current: { 'f-money': { amount: 5, currencyId: BYN } },
      patch: { 'f-money': { currencyId: BYN, amount: 5 } as never },
    });
    expect(next).toEqual({ 'f-money': { amount: 5, currencyId: BYN } });
    expect(changes).toEqual([]);
    expect(validator.validate).toHaveBeenCalledWith('task', expect.anything(), {}, undefined);
  });

  it('ошибка валидатора превращается в 422 с перечнем полей', async () => {
    const { registry, validator } = makeRegistry([definition({ id: 'f-a', type: 'text' })]);
    validator.validate.mockResolvedValue([
      { fieldId: 'f-a', reason: 'invalid', message: 'Value does not match field type' },
    ]);
    await expect(
      registry.prepareUpdate('task', { current: {}, patch: { 'f-a': 'x' } }),
    ).rejects.toMatchObject({ code: ErrorCode.CUSTOM_FIELD_VALUE_INVALID });
  });

  it('пустой патч не трогает значения и не падает', async () => {
    const { registry } = makeRegistry([definition({ id: 'f-a', type: 'text' })]);
    const result = await registry.prepareUpdate('task', { current: { 'f-a': 'x' }, patch: {} });
    expect(result).toEqual({ next: { 'f-a': 'x' }, changes: [] });
  });
});

describe('invalidValues (#431, Р2)', () => {
  it('доменная ошибка 422 с перечнем полей', () => {
    const error = invalidValues([{ fieldId: 'f-a', reason: 'unknown', message: 'Unknown' }]);
    expect(error.code).toBe(ErrorCode.CUSTOM_FIELD_VALUE_INVALID);
    expect(error.details).toEqual({
      issues: [{ fieldId: 'f-a', reason: 'unknown', message: 'Unknown' }],
    });
  });
});
