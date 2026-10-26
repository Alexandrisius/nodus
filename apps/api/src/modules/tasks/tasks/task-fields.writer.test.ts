import { describe, expect, it, vi } from 'vitest';
import { ErrorCode, type CreationFieldSlot, type ProcessType } from '@nodus/contracts';

import { TaskFieldsWriter, type TaskFieldsRow } from './task-fields.writer.js';

/**
 * Обязательное при создании нельзя очистить (#432, Р5): проверка стоит в
 * общем писателе полей — её получают и PATCH карточки, и окно перехода.
 * Тип читается портом «Процессов», форма — контрактом (одна грамматика с
 * окном создания).
 */

const FIELD_ID = '33333333-3333-4333-8333-333333333333';

const ROW: TaskFieldsRow = {
  id: 't1',
  number: 7,
  typeId: 'type-1',
  parentId: null,
  assigneeId: 'bob',
};

const slot = (key: CreationFieldSlot['key']): CreationFieldSlot => ({
  key,
  label: null,
  required: true,
  preset: null,
});

const type = (keys: CreationFieldSlot['key'][]): ProcessType =>
  ({
    id: 'type-1',
    category: 'task',
    creationForm: { fields: keys.map(slot), chips: [] },
  }) as unknown as ProcessType;

function setup(required: CreationFieldSlot['key'][] = []) {
  const repo = {
    lockTree: vi.fn(async () => void 0),
    lock: vi.fn(async () => void 0),
    parentIdOf: vi.fn(async () => ROW.parentId),
    isDescendant: vi.fn(async () => false),
    updateFields: vi.fn(async () => void 0),
    findWithParticipants: vi.fn(async () => ({
      ...ROW,
      title: 'Т',
      deadline: null,
      participants: [],
    })),
  };
  const facts = { customFieldsOf: vi.fn(async () => ({})) };
  const eventBus = { emit: vi.fn(async () => void 0) };
  const participantsRepo = { remove: vi.fn(async () => void 0) };
  const placements = { sync: vi.fn(async () => void 0) };
  const customFields = {
    prepareUpdate: vi.fn(async () => ({ next: {}, changes: [] })),
  };
  const catalog = { typeById: vi.fn(async () => type(required)) };
  const writer = new TaskFieldsWriter(
    repo as never,
    facts as never,
    eventBus as never,
    participantsRepo as never,
    placements as never,
    customFields as never,
    catalog as never,
  );
  return { writer, repo };
}

const apply = (
  writer: TaskFieldsWriter,
  patch: Parameters<TaskFieldsWriter['apply']>[3],
  fields: string[] = Object.keys(patch),
) => writer.apply({} as never, 'alice', ROW, patch, fields);

describe('TaskFieldsWriter: обязательные поля типа (#432, Р5)', () => {
  it('очистка обязательного срока — 422 reason=clear, записи нет', async () => {
    const { writer, repo } = setup(['deadline']);
    await expect(apply(writer, { deadline: null })).rejects.toMatchObject({
      code: ErrorCode.PROCESS_TYPE_FIELDS_REQUIRED,
      details: { typeId: 'type-1', fields: ['deadline'], reason: 'clear' },
    });
    expect(repo.updateFields).not.toHaveBeenCalled();
  });

  it('очистка обязательного описания — 422', async () => {
    const { writer } = setup(['description']);
    await expect(apply(writer, { description: '' })).rejects.toMatchObject({
      code: ErrorCode.PROCESS_TYPE_FIELDS_REQUIRED,
      details: { fields: ['description'] },
    });
  });

  it('очистка обязательного атрибута типа — 422', async () => {
    const { writer } = setup([`cf.${FIELD_ID}`]);
    await expect(apply(writer, { customFields: { [FIELD_ID]: null } })).rejects.toMatchObject({
      code: ErrorCode.PROCESS_TYPE_FIELDS_REQUIRED,
      details: { fields: [`cf.${FIELD_ID}`] },
    });
  });

  it('новый срок вместо пустого — проходит', async () => {
    const { writer, repo } = setup(['deadline']);
    await apply(writer, { deadline: '2026-11-01T00:00:00.000Z' });
    expect(repo.updateFields).toHaveBeenCalled();
  });

  it('поле не обязательное — очистка проходит', async () => {
    const { writer, repo } = setup([]);
    await apply(writer, { deadline: null });
    expect(repo.updateFields).toHaveBeenCalled();
  });

  it('патч без полей формы (заголовок) не читает тип', async () => {
    const { writer, repo } = setup(['deadline']);
    await apply(writer, { title: 'Новое' });
    expect(repo.updateFields).toHaveBeenCalled();
  });
});
