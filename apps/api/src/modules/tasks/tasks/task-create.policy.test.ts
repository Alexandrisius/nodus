import { describe, expect, it, vi } from 'vitest';
import { ErrorCode, type CreationFieldSlot, type ProcessType } from '@nodus/contracts';

import { TaskCreatePolicy } from './task-create.policy.js';

/**
 * Политика создания по типу (#432, Р4/Р5): скрытые значения формы важнее
 * ввода, недействительный пресет — 422, обязательные проверяются после
 * умолчаний (ответственного сервис ставит сам).
 */

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

const slot = (overrides: Partial<CreationFieldSlot> & Pick<CreationFieldSlot, 'key'>) =>
  ({ label: null, required: false, preset: null, ...overrides }) as CreationFieldSlot;

const type = (fields: CreationFieldSlot[]): ProcessType =>
  ({
    id: 'type-1',
    code: 'custom-1',
    name: 'Переработка',
    category: 'task',
    creationForm: { fields, chips: [] },
  }) as unknown as ProcessType;

function setup(active: string[] = [USER_A, USER_B]) {
  const profiles = { filterActiveUserIds: vi.fn(async () => active) };
  return { policy: new TaskCreatePolicy(profiles as never), profiles };
}

describe('TaskCreatePolicy.withPresets (#432, Р4)', () => {
  it('скрытое значение формы важнее введённого', async () => {
    const { policy } = setup();
    const body = await policy.withPresets(type([slot({ key: 'priority', preset: 'high' })]), {
      title: 'Т',
      priority: 'low',
    } as never);
    expect(body.priority).toBe('high');
  });

  it('пресет списка сотрудников ставится в тело', async () => {
    const { policy } = setup();
    const body = await policy.withPresets(
      type([slot({ key: 'coexecutors', preset: [USER_A, USER_B] })]),
      { title: 'Т' } as never,
    );
    expect(body.coexecutorIds).toEqual([USER_A, USER_B]);
  });

  it('пресет уволенного сотрудника — 422 PROCESS_TYPE_PRESET_INVALID', async () => {
    const { policy } = setup([USER_B]);
    await expect(
      policy.withPresets(type([slot({ key: 'assignee', preset: USER_A })]), {
        title: 'Т',
      } as never),
    ).rejects.toMatchObject({
      code: ErrorCode.PROCESS_TYPE_PRESET_INVALID,
      details: { typeId: 'type-1', fields: ['assignee'] },
    });
  });

  it('форма без пресетов сотрудников не ходит в профили', async () => {
    const { policy, profiles } = setup();
    await policy.withPresets(type([slot({ key: 'description', preset: 'текст' })]), {
      title: 'Т',
    } as never);
    expect(profiles.filterActiveUserIds).not.toHaveBeenCalled();
  });
});

describe('TaskCreatePolicy.assertComplete (#432, Р5)', () => {
  it('не хватает обязательного — 422 с перечнем и reason=create', () => {
    const { policy } = setup();
    expect(() =>
      policy.assertComplete(type([slot({ key: 'deadline', required: true })]), {
        title: 'Т',
      } as never),
    ).toThrow(
      expect.objectContaining({
        code: ErrorCode.PROCESS_TYPE_FIELDS_REQUIRED,
        details: { typeId: 'type-1', fields: ['deadline'], reason: 'create' },
      }),
    );
  });

  it('ответственный не считается пропущенным: его ставит сервер', () => {
    const { policy } = setup();
    expect(() =>
      policy.assertComplete(type([slot({ key: 'assignee', required: true })]), {
        title: 'Т',
      } as never),
    ).not.toThrow();
  });

  it('заполненное обязательное пропускает', () => {
    const { policy } = setup();
    expect(() =>
      policy.assertComplete(type([slot({ key: 'description', required: true })]), {
        title: 'Т',
        description: 'есть',
      } as never),
    ).not.toThrow();
  });

  it('обязательный атрибут типа, заполненный умолчанием, — не пропущен', () => {
    const { policy } = setup();
    const fieldId = '33333333-3333-4333-8333-333333333333';
    expect(() =>
      policy.assertComplete(type([slot({ key: `cf.${fieldId}`, required: true })]), {
        title: 'Т',
        customFields: { [fieldId]: 'из умолчания' },
      } as never),
    ).not.toThrow();
  });
});
