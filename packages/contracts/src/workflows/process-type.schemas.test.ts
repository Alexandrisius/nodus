import { describe, expect, it } from 'vitest';

import { createProcessTypeBodySchema, processTypeSchema } from './process-type.schemas.js';

const base = { kind: 'simple' } as const;

describe('createProcessTypeBodySchema', () => {
  it('по умолчанию создаёт тип задачи без направления', () => {
    const parsed = createProcessTypeBodySchema.parse({
      name: 'Задание сметчикам',
      icon: 'calculator',
      color: 'info',
      base,
    });
    expect(parsed.category).toBe('task');
    expect(parsed.direction).toBeUndefined();
  });

  it('письму требует направление', () => {
    const letter = {
      name: 'Входящее письмо',
      category: 'letter',
      direction: 'incoming',
      icon: 'file-text',
      color: 'neutral',
      base,
    };
    expect(createProcessTypeBodySchema.parse(letter).direction).toBe('incoming');
    const withoutDirection = { ...letter, direction: undefined };
    expect(createProcessTypeBodySchema.safeParse(withoutDirection).success).toBe(false);
  });

  it('задаче запрещает направление', () => {
    const result = createProcessTypeBodySchema.safeParse({
      name: 'Задача',
      direction: 'incoming',
      icon: 'square-check',
      color: 'neutral',
      base,
    });
    expect(result.success).toBe(false);
  });
});

describe('processTypeSchema', () => {
  it('несёт категорию, направление и маршрут; structural снят', () => {
    const parsed = processTypeSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      code: 'task.default',
      name: 'Стандартный',
      category: 'task',
      direction: null,
      icon: 'square-check',
      color: 'neutral',
      description: '',
      creatable: true,
      isSystem: true,
      sortOrder: 0,
      archivedAt: null,
      workflowId: '22222222-2222-4222-8222-222222222222',
      config: {
        card: { hiddenBlocks: [], roleLabels: {} },
        access: { view: null, create: null },
      },
      creationForm: { fields: [], chips: [] },
      viewer: { canView: true, canCreate: true },
    });
    expect(parsed.category).toBe('task');
    expect(parsed.direction).toBeNull();
    expect(parsed).not.toHaveProperty('structural');
  });

  it('без конфигурации, формы и зрителя тип невалиден (#432)', () => {
    const result = processTypeSchema.safeParse({
      id: '11111111-1111-4111-8111-111111111111',
      code: 'task.default',
      name: 'Стандартный',
      category: 'task',
      direction: null,
      icon: 'square-check',
      color: 'neutral',
      description: '',
      creatable: true,
      isSystem: true,
      sortOrder: 0,
      archivedAt: null,
      workflowId: '22222222-2222-4222-8222-222222222222',
    });
    expect(result.success).toBe(false);
  });
});
