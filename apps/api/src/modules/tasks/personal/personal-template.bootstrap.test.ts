import { describe, expect, it, vi } from 'vitest';

import { PersonalBoardsRepository } from './personal-boards.repository.js';
import { PERSONAL_TEMPLATE, PERSONAL_TEMPLATE_REVISION } from './personal-template.js';

/** Засев шаблона «Моего плана» (#428, ADR-0024 — временное исключение):
 *  «засев один раз», настроенное не трогается, существующий шаблон не
 *  пересоздаётся. БД мокается. */

const WF_ID = '00000000-0000-4000-8000-0000000000f1';

function setup(
  opts: {
    exists?: boolean;
    customizedAt?: Date | null;
    revision?: number;
    existingStages?: string[];
  } = {},
) {
  const stageRows = new Map<string, { id: string }>(
    (opts.existingStages ?? []).map((code) => [code, { id: `stage-${code}` }]),
  );
  const tx = {
    workflow: {
      findUnique: vi.fn(async () =>
        opts.exists ? { id: WF_ID, code: PERSONAL_TEMPLATE.code } : null,
      ),
      create: vi.fn(async () => ({ id: WF_ID })),
      findUniqueOrThrow: vi.fn(async () => ({
        customizedAt: opts.customizedAt ?? null,
        catalogRevision: opts.revision ?? 0,
      })),
      update: vi.fn(async () => ({})),
    },
    workflowStage: {
      findUnique: vi.fn(async ({ where }: { where: { workflowId_code: { code: string } } }) => {
        const found = stageRows.get(where.workflowId_code.code);
        return found ? { id: found.id } : null;
      }),
      create: vi.fn(async ({ data }: { data: { code: string } }) => {
        stageRows.set(data.code, { id: `stage-${data.code}` });
        return { id: `stage-${data.code}` };
      }),
      update: vi.fn(async () => ({})),
    },
    $queryRaw: vi.fn(async () => []),
  };
  const repo = new PersonalBoardsRepository({} as never);
  return { repo, tx };
}

describe('PersonalBoardsRepository.seedTemplate (#428)', () => {
  it('новая установка: создаёт шаблон и все колонки, поднимает ревизию', async () => {
    const { repo, tx } = setup();
    await repo.seedTemplate(tx as never);
    expect(tx.workflow.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ code: PERSONAL_TEMPLATE.code, kind: 'personal' }),
      }),
    );
    expect(tx.workflowStage.create).toHaveBeenCalledTimes(PERSONAL_TEMPLATE.stages.length);
    expect(tx.workflow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { catalogRevision: PERSONAL_TEMPLATE_REVISION },
      }),
    );
  });

  it('ревизия применена — повторный прогон ничего не меняет', async () => {
    const { repo, tx } = setup({ exists: true, revision: PERSONAL_TEMPLATE_REVISION });
    await repo.seedTemplate(tx as never);
    expect(tx.workflow.create).not.toHaveBeenCalled();
    expect(tx.workflowStage.create).not.toHaveBeenCalled();
    expect(tx.workflow.update).not.toHaveBeenCalled();
  });

  it('настроенное (customizedAt) не трогается никогда', async () => {
    const { repo, tx } = setup({ exists: true, customizedAt: new Date(), revision: 1 });
    await repo.seedTemplate(tx as never);
    expect(tx.workflowStage.create).not.toHaveBeenCalled();
    expect(tx.workflow.update).not.toHaveBeenCalled();
  });

  it('старая ревизия: существующая колонка обновляется, недостающие создаются', async () => {
    const { repo, tx } = setup({ exists: true, revision: 1, existingStages: ['backlog'] });
    await repo.seedTemplate(tx as never);
    expect(tx.workflowStage.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'stage-backlog' } }),
    );
    expect(tx.workflowStage.create).toHaveBeenCalledTimes(PERSONAL_TEMPLATE.stages.length - 1);
  });
});
