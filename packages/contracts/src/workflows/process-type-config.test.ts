import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PROCESS_TYPE_CONFIG,
  isDefaultProcessType,
  normalizeTypeConfig,
  typeAccessFor,
  updateProcessTypeConfigBodySchema,
} from './process-type-config.js';

/** Конфигурация типа процесса (#432): толерантное чтение, доступ по ролям,
 *  блокировка «Стандартного» и закрытая схема правки. */

const roleA = '11111111-1111-4111-8111-111111111111';
const roleB = '22222222-2222-4222-8222-222222222222';

describe('normalizeTypeConfig', () => {
  it('пустой объект — умолчания', () => {
    expect(normalizeTypeConfig({})).toEqual(DEFAULT_PROCESS_TYPE_CONFIG);
    expect(normalizeTypeConfig(null)).toEqual(DEFAULT_PROCESS_TYPE_CONFIG);
  });

  it('битый раздел заменяется умолчанием, целые разделы живут', () => {
    const config = normalizeTypeConfig({
      card: { hiddenBlocks: ['chat', 'нет-такого'], roleLabels: { assignee: 'Заявитель' } },
      access: { view: 'все', create: null },
      pulse: true,
    });
    expect(config.card).toEqual(DEFAULT_PROCESS_TYPE_CONFIG.card);
    expect(config.access).toEqual({ view: null, create: null });
    expect(config.pulse).toBe(true);
  });

  it('валидные разделы читаются целиком', () => {
    const config = normalizeTypeConfig({
      card: { hiddenBlocks: ['checklist', 'subtasks'], roleLabels: { assignee: 'Заявитель' } },
      access: { view: [roleA], create: [roleB] },
      pulse: false,
    });
    expect(config.card.hiddenBlocks).toEqual(['checklist', 'subtasks']);
    expect(config.card.roleLabels.assignee).toBe('Заявитель');
    expect(config.access).toEqual({ view: [roleA], create: [roleB] });
  });
});

describe('typeAccessFor', () => {
  const type = (over: Partial<Parameters<typeof typeAccessFor>[0]> = {}) => ({
    config: DEFAULT_PROCESS_TYPE_CONFIG,
    creatable: true,
    ...over,
  });

  it('администратор видит и создаёт всё, даже скрытый тип', () => {
    expect(
      typeAccessFor(
        type({
          creatable: false,
          config: { ...DEFAULT_PROCESS_TYPE_CONFIG, access: { view: [roleA], create: [roleA] } },
        }),
        { roleIds: [], isAdmin: true },
      ),
    ).toEqual({ canView: true, canCreate: true });
  });

  it('«всем» и создание разрешено — обычный сотрудник создаёт', () => {
    expect(typeAccessFor(type(), { roleIds: [], isAdmin: false })).toEqual({
      canView: true,
      canCreate: true,
    });
  });

  it('роль в списке «видят», но не в «создают» — видит, не создаёт', () => {
    const restricted = type({
      config: { ...DEFAULT_PROCESS_TYPE_CONFIG, access: { view: [roleA], create: [roleB] } },
    });
    expect(typeAccessFor(restricted, { roleIds: [roleA], isAdmin: false })).toEqual({
      canView: true,
      canCreate: false,
    });
  });

  it('без общей роли типа не видно вовсе', () => {
    const restricted = type({
      config: { ...DEFAULT_PROCESS_TYPE_CONFIG, access: { view: [roleA], create: null } },
    });
    expect(typeAccessFor(restricted, { roleIds: [roleB], isAdmin: false })).toEqual({
      canView: false,
      canCreate: false,
    });
  });

  it('creatable=false — создают только администраторы (Р6)', () => {
    expect(typeAccessFor(type({ creatable: false }), { roleIds: [roleA], isAdmin: false })).toEqual(
      { canView: true, canCreate: false },
    );
  });

  it('«Стандартный» опознаётся по коду', () => {
    expect(isDefaultProcessType({ code: 'task' })).toBe(true);
    expect(isDefaultProcessType({ code: 'overtime' })).toBe(false);
  });
});

describe('updateProcessTypeConfigBodySchema', () => {
  it('один раздел не добавляет соседние (gotcha Zod 4 .partial)', () => {
    const parsed = updateProcessTypeConfigBodySchema.parse({ pulse: true });
    expect(parsed).toEqual({ pulse: true });
    expect('card' in parsed).toBe(false);
    expect('access' in parsed).toBe(false);
  });

  it('неизвестный ключ отвергается, пустая правка — тоже', () => {
    expect(updateProcessTypeConfigBodySchema.safeParse({ pulse: true, extra: 1 }).success).toBe(
      false,
    );
    expect(updateProcessTypeConfigBodySchema.safeParse({}).success).toBe(false);
  });

  it('access: null — «всем», список ролей — ограничение', () => {
    expect(
      updateProcessTypeConfigBodySchema.parse({ access: { view: null, create: [roleA] } }),
    ).toEqual({ access: { view: null, create: [roleA] } });
  });
});
