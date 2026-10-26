import { checkWorkflowDocument, type WorkflowDocument } from '@nodus/contracts';
import { describe, expect, it } from 'vitest';

import { catalogPostFunctions } from './system-catalog.js';
import { LETTER_CATALOG_PROCESS_TYPES } from './system-catalog-letters.js';

/**
 * Каталог писем обязан проходить проверку документа категории `letter`
 * (#55, B7): если ревизия добавит задачную роль, гейт или раздел окна,
 * движок отверг бы заготовку на публикации — тест ловит это до ревью.
 */
function documentOf(
  def: (typeof LETTER_CATALOG_PROCESS_TYPES)[number]['workflow'],
): WorkflowDocument {
  const stageIdByCode = new Map(def.stages.map((stage) => [stage.code, stage.code]));
  return {
    stages: def.stages.map((stage, index) => ({
      id: stage.code,
      code: stage.code,
      name: stage.name,
      color: stage.color,
      systemState: stage.systemState,
      outcome: stage.outcome ?? null,
      isInitial: stage.isInitial ?? false,
      sortOrder: index,
    })),
    transitions: def.transitions.map((transition, index) => ({
      id: transition.code,
      code: transition.code,
      name: transition.name,
      fromStageId: transition.from,
      toStageId: transition.to,
      display: transition.display,
      sortOrder: index,
      rules: {
        conditions: transition.rules.conditions ?? [],
        validators: transition.rules.validators ?? [],
        postFunctions: catalogPostFunctions(transition, stageIdByCode),
      },
      form: transition.form ?? { enabled: false, sections: [] },
    })),
  } as WorkflowDocument;
}

describe('каталог писем проходит проверку документа (#55, Р5)', () => {
  for (const { type, workflow } of LETTER_CATALOG_PROCESS_TYPES) {
    it(`${type.name}: ошибок нет, нумерация настроена`, () => {
      const problems = checkWorkflowDocument(documentOf(workflow), {
        category: 'letter',
        numberingConfigured: Boolean(type.numbering),
      });
      expect(problems.filter((problem) => problem.severity === 'error')).toEqual([]);
    });
  }

  it('регистрация без серии — ошибка numbering_not_configured', () => {
    const incoming = LETTER_CATALOG_PROCESS_TYPES[0]!;
    const problems = checkWorkflowDocument(documentOf(incoming.workflow), {
      category: 'letter',
      numberingConfigured: false,
    });
    expect(problems.map((problem) => problem.code)).toContain('numbering_not_configured');
  });
});
