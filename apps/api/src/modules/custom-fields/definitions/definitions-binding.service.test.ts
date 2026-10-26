import { describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '@nodus/contracts';

import { DefinitionsBindingService } from './definitions-binding.service.js';
import type { FieldDefinitionRow } from './definition.mapper.js';

/**
 * Точечная привязка атрибута к типу (#432, Р8): идемпотентность, проверка
 * типа (живой, своей категории) и запрет снятия, пока атрибут работает в
 * опубликованном маршруте типа. Репозиторий и порты — моки: логика без БД.
 */

const ROW: FieldDefinitionRow = {
  id: '11111111-1111-4111-8111-111111111111',
  scope: 'task',
  type: 'text',
  name: '№ накладной',
  hint: null,
  settings: {},
  defaultValue: null,
  reportIndexed: false,
  hidden: false,
  sortOrder: 0,
  createdAt: new Date('2026-10-26T00:00:00.000Z'),
  updatedAt: new Date('2026-10-26T00:00:00.000Z'),
  typeBindings: [{ processTypeId: 't-1' }],
};

function makeService(overrides: { workflows?: { id: string; name: string }[] } = {}) {
  const definitions = {
    findById: vi.fn(async (): Promise<FieldDefinitionRow | null> => ROW),
    bindType: vi.fn(async () => void 0),
    unbindType: vi.fn(async () => true),
    lockScope: vi.fn(async () => void 0),
  };
  const mapper = { toDto: vi.fn(async () => ({ id: ROW.id, typeIds: ['t-1'] })) };
  const txRunner = { run: vi.fn(async (fn: (tx: unknown) => unknown) => fn({})) };
  const eventBus = { emit: vi.fn(async () => void 0) };
  const workflows = { workflowsUsingField: vi.fn(async () => overrides.workflows ?? []) };
  const catalog = {
    typeRefs: vi.fn(async (ids: string[]) =>
      ids.map((id) => ({ id, code: `custom-${id}`, name: 'Тип', category: 'task' })),
    ),
  };
  const logger = { setContext: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const service = new DefinitionsBindingService(
    definitions as never,
    mapper as never,
    txRunner as never,
    eventBus as never,
    workflows as never,
    catalog as never,
    logger as never,
  );
  return { service, definitions, eventBus, workflows, catalog };
}

describe('DefinitionsBindingService.bind (#432, Р8)', () => {
  it('идемпотентна: повтор пишет то же и сообщает typeIds', async () => {
    const { service, definitions, eventBus } = makeService();
    await service.bind(ROW.id, 't-1', 'actor-1');
    await service.bind(ROW.id, 't-1', 'actor-1');
    expect(definitions.bindType).toHaveBeenCalledTimes(2);
    expect(definitions.bindType).toHaveBeenCalledWith(ROW.id, 't-1', expect.anything());
    expect(eventBus.emit).toHaveBeenCalledWith(
      expect.anything(),
      'custom_field.definition_changed',
      expect.objectContaining({ change: 'updated', fields: ['typeIds'] }),
      expect.anything(),
    );
  });

  it('тип чужой категории — 422, неизвестный — 404', async () => {
    const foreign = makeService();
    foreign.catalog.typeRefs.mockResolvedValue([
      { id: 't-1', code: 'c', name: 'Письмо', category: 'letter' },
    ]);
    await expect(foreign.service.bind(ROW.id, 't-1', 'actor-1')).rejects.toMatchObject({
      code: ErrorCode.CUSTOM_FIELD_BINDING_INVALID,
    });
    expect(foreign.definitions.bindType).not.toHaveBeenCalled();

    const missing = makeService();
    missing.catalog.typeRefs.mockResolvedValue([]);
    await expect(missing.service.bind(ROW.id, 't-1', 'actor-1')).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
  });
});

describe('DefinitionsBindingService.unbind (#432, Р8)', () => {
  it('снятие, пока атрибут работает в маршруте типа — 409 со списком процессов', async () => {
    const { service, workflows, definitions } = makeService({
      workflows: [{ id: 'w-1', name: 'Переработка' }],
    });
    await expect(service.unbind(ROW.id, 't-1', 'actor-1')).rejects.toMatchObject({
      code: ErrorCode.CUSTOM_FIELD_IN_USE,
      details: { workflows: [{ id: 'w-1', name: 'Переработка' }] },
    });
    expect(workflows.workflowsUsingField).toHaveBeenCalledWith('task', ROW.id, { typeId: 't-1' });
    expect(definitions.unbindType).not.toHaveBeenCalled();
  });

  it('свободная привязка снимается идемпотентно', async () => {
    const { service, definitions, eventBus } = makeService();
    await service.unbind(ROW.id, 't-1', 'actor-1');
    await service.unbind(ROW.id, 't-1', 'actor-1');
    expect(definitions.unbindType).toHaveBeenCalledTimes(2);
    expect(eventBus.emit).toHaveBeenCalledWith(
      expect.anything(),
      'custom_field.definition_changed',
      expect.objectContaining({ fields: ['typeIds'] }),
      expect.anything(),
    );
  });

  it('неизвестный атрибут — 404', async () => {
    const { service, definitions } = makeService();
    definitions.findById.mockResolvedValue(null);
    await expect(service.unbind('nope', 't-1', 'actor-1')).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
  });
});
