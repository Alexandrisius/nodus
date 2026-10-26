import { describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '@nodus/contracts';

import { assertWorkflowVisible } from './workflow-visibility.js';

/**
 * Видимость маршрута скрытого типа (#432, security-ревью): документ теперь
 * несёт форму создания со скрытыми значениями, поэтому читатель без
 * `workflow.manage` получает 404, если не видит ни одного типа маршрута.
 */

const HIDDEN_ROLE = '00000000-0000-4000-8000-0000000000aa';

const types = (rows: { id: string; config?: unknown }[]) => ({
  findByIds: vi.fn(async () => rows),
});
const membership = (roles: { id: string; code: string }[] = []) => ({
  effectiveRoles: vi.fn(async () => roles),
});
const user = (permissions: string[] = []) => ({ id: 'u1', permissions });

describe('assertWorkflowVisible (#432)', () => {
  it('скрытый тип — 404, существование не подтверждается', async () => {
    await expect(
      assertWorkflowVisible(
        types([{ id: 't1', config: { access: { view: [HIDDEN_ROLE], create: null } } }]) as never,
        membership() as never,
        ['t1'],
        user(),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
  });

  it('видимый тип — пропускает', async () => {
    await expect(
      assertWorkflowVisible(
        types([{ id: 't1', config: {} }]) as never,
        membership() as never,
        ['t1'],
        user(),
      ),
    ).resolves.toBeUndefined();
  });

  it('роль подразделения в эффективных ролях — тип виден', async () => {
    await expect(
      assertWorkflowVisible(
        types([{ id: 't1', config: { access: { view: [HIDDEN_ROLE], create: null } } }]) as never,
        membership([{ id: HIDDEN_ROLE, code: 'custom' }]) as never,
        ['t1'],
        user(),
      ),
    ).resolves.toBeUndefined();
  });

  it('workflow.manage читает маршрут любого типа', async () => {
    await expect(
      assertWorkflowVisible(
        types([{ id: 't1', config: { access: { view: [HIDDEN_ROLE], create: null } } }]) as never,
        membership() as never,
        ['t1'],
        user(['workflow.manage']),
      ),
    ).resolves.toBeUndefined();
  });

  it('маршрут без типов (сирота) читается как раньше', async () => {
    await expect(
      assertWorkflowVisible(types([]) as never, membership() as never, [], user()),
    ).resolves.toBeUndefined();
  });
});
