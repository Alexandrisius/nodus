import { describe, expect, it } from 'vitest';
import { WORKFLOW_EVENTS } from '@nodus/contracts';

import { stageDrift } from './catalog.bootstrap.js';
import { CATALOG_REVISION } from './system-catalog.js';
import { QUICK, STANDARD, setup, stale, uuidFor, wfId } from './catalog-bootstrap.test-helper.js';

describe('CatalogBootstrap — «засев один раз» (ADR-0021)', () => {
  it('ревизия применена — повторный прогон ничего не меняет', async () => {
    const { bootstrap, repo, eventBus } = setup();
    await bootstrap.ensure();
    expect(repo.updateStage).not.toHaveBeenCalled();
    expect(repo.createStage).not.toHaveBeenCalled();
    expect(repo.updateTransition).not.toHaveBeenCalled();
    expect(repo.createTransition).not.toHaveBeenCalled();
    expect(repo.archiveTransition).not.toHaveBeenCalled();
    expect(repo.applyWorkflowRevision).not.toHaveBeenCalled();
    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  it('«Комплект» сеется с бумажным значком file-text (#467)', async () => {
    const { bootstrap, repo } = setup();
    await bootstrap.ensure();
    expect(repo.ensureType).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ code: 'kit', icon: 'file-text' }),
    );
  });

  it('старая ревизия: стадия обновляется, переход вне каталога — в архив, системная публикация', async () => {
    const { bootstrap, repo, eventBus, tx } = setup({
      workflows: { 'task.default': { customizedAt: null, catalogRevision: 1 } },
      stageOverrides: { on_control: { name: 'Ждёт контроля', systemState: 'done' } },
      legacyTransitions: [{ id: 'tr-complete-new', code: 'complete_new' }],
    });
    await bootstrap.ensure();
    expect(repo.updateStage).toHaveBeenCalledWith(tx, uuidFor('on_control'), {
      name: 'На утверждении',
    });
    expect(repo.archiveTransition).toHaveBeenCalledWith(tx, 'tr-complete-new', expect.any(Date));
    expect(repo.applyWorkflowRevision).toHaveBeenCalledWith(
      tx,
      wfId(STANDARD.code),
      CATALOG_REVISION,
    );
    // Группа on_control не менялась (done → done) — пересчитывать нечего.
    expect(eventBus.emit).toHaveBeenCalledWith(
      tx,
      WORKFLOW_EVENTS.PUBLISHED,
      {
        workflowId: wfId(STANDARD.code),
        typeIds: ['type-task'],
        version: 5,
        category: 'task',
        moves: [],
        restates: [],
      },
      { actorId: null, aggregateType: 'workflow', aggregateId: wfId(STANDARD.code) },
    );
  });

  it('каталог сменил группу статуса — задачи пересчитываются фоном (restates события)', async () => {
    const { bootstrap, repo, eventBus, tx } = setup({
      workflows: stale('task.default'),
      stageOverrides: { on_control: { systemState: 'active' } },
    });
    await bootstrap.ensure();
    expect(repo.updateStage).toHaveBeenCalledWith(tx, uuidFor('on_control'), {
      systemState: 'done',
    });
    expect(eventBus.emit).toHaveBeenCalledWith(
      tx,
      WORKFLOW_EVENTS.PUBLISHED,
      expect.objectContaining({
        restates: [{ stageId: uuidFor('on_control'), systemState: 'done' }],
      }),
      expect.anything(),
    );
  });

  it('новая установка: «Быстрый» засевается с нуля (все статусы и кнопки каталога)', async () => {
    const { bootstrap, repo } = setup({
      workflows: { 'task.quick': { customizedAt: null, catalogRevision: 0 } },
      emptyWorkflows: [wfId(QUICK.code)],
    });
    await bootstrap.ensure();
    const quickStages = repo.createStage.mock.calls.filter((c) => c[1] === wfId(QUICK.code));
    expect(quickStages).toHaveLength(QUICK.stages.length);
    expect(repo.createTransition).toHaveBeenCalledTimes(QUICK.transitions.length);
  });

  it('настроенное (customizedAt) не трогается никогда', async () => {
    const { bootstrap, repo, eventBus, logger } = setup({
      workflows: {
        'task.default': { customizedAt: new Date(), catalogRevision: 1 },
        'task.quick': { customizedAt: new Date(), catalogRevision: 1 },
      },
    });
    await bootstrap.ensure();
    expect(repo.updateStage).not.toHaveBeenCalled();
    expect(repo.updateTransition).not.toHaveBeenCalled();
    expect(eventBus.emit).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ workflow: 'task.default' }),
      expect.stringContaining('skip_customized'),
    );
  });

  it('имя системного типа занято пользовательским — skip+warn, без схемы и маршрута (#467)', async () => {
    const { bootstrap, repo, logger } = setup();
    // Пользователь уже создал свой тип «Комплект» — системный не сеем.
    repo.ensureType.mockImplementation((_tx: unknown, def: { code: string }) =>
      def.code === 'kit' ? Promise.resolve(null) : Promise.resolve({ id: `type-${def.code}` }),
    );
    await bootstrap.ensure();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'kit', name: 'Комплект' }),
      expect.stringContaining('skip_name_clash'),
    );
    // Схема/маршрут kit не создаются; «Изменение» (chg) сеется как обычно.
    const schemeTypes = repo.ensureSchemeEntry.mock.calls.map((call) => call[2]);
    expect(schemeTypes).toContain('type-chg');
    expect(schemeTypes).not.toContain('type-kit');
    expect(repo.ensureWorkflow).not.toHaveBeenCalledWith(expect.anything(), {
      code: 'task.kit',
      name: 'Комплект',
      kind: 'task',
    });
  });
});

describe('stageDrift', () => {
  const base = {
    name: 'A',
    color: 'info',
    sortOrder: 0,
    systemState: 'active',
    outcome: null,
    isInitial: false,
  };
  it('только разошедшиеся поля; совпадение — null', () => {
    expect(stageDrift(base, base)).toBeNull();
    expect(stageDrift(base, { ...base, isInitial: true, name: 'B' })).toEqual({
      isInitial: true,
      name: 'B',
    });
    expect(stageDrift(base, { ...base, outcome: 'success' })).toEqual({ outcome: 'success' });
  });
});

describe('CatalogBootstrap — ревизия 4: окна перехода (#380)', () => {
  it('сиды пишут формы: причина у паузы/возврата/отмены, итог у завершения, окно у утверждения', async () => {
    const { bootstrap, repo } = setup({ workflows: stale('task.default') });
    await bootstrap.ensure();
    const formOf = (name: string) =>
      (
        repo.updateTransition.mock.calls.find(
          (call) => (call[2] as { name: string }).name === name,
        )?.[2] as {
          form: {
            enabled: boolean;
            sections: { kind: string; required?: boolean; label?: string }[];
          };
        }
      )?.form;
    expect(formOf('Приостановить')).toMatchObject({
      enabled: true,
      sections: [{ kind: 'comment', required: true, label: 'Причина приостановки' }],
    });
    expect(formOf('Вернуть на доработку')).toMatchObject({
      sections: [{ kind: 'comment', required: true, label: 'Причина возврата' }],
    });
    expect(formOf('Отменить')).toMatchObject({
      sections: [{ kind: 'comment', required: true, label: 'Причина отмены' }],
    });
    expect(formOf('Завершить')).toMatchObject({
      sections: [
        { kind: 'result' },
        { kind: 'result_files', label: 'Файлы итога' },
        { kind: 'result_messages', required: false },
      ],
    });
    expect(formOf('Утвердить')).toMatchObject({
      sections: [{ kind: 'comment', required: false, label: 'Комментарий' }],
    });
  });
});
