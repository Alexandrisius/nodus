import { describe, expect, it } from 'vitest';

import type { WorkflowGateFacts } from '../../../core/ports/workflow-entity.port.js';
import { evaluateValidators, parseRules } from './transition-rules.js';

const facts: WorkflowGateFacts = {
  stageId: '00000000-0000-4000-8000-000000000001',
  acceptRequired: false,
  creatorIsAssignee: false,
  openSubtasks: 0,
  reviewSubtasks: 0,
  checklistDone: 0,
  checklistTotal: 0,
  spentMinutes: 0,
  description: '',
  deadline: null,
  assigneeId: 'u1',
  plannedMinutes: null,
  hasResult: false,
  resultFileCount: 0,
};

describe('гейт result_files (#380)', () => {
  const rules = parseRules({ validators: [{ kind: 'result_files', min: 2 }] });

  it('файлов меньше минимума — причина с count и min', () => {
    expect(evaluateValidators(rules, { ...facts, resultFileCount: 1 })).toEqual([
      { kind: 'result_files', count: 1, min: 2 },
    ]);
  });

  it('файлов достаточно — гейт пройден', () => {
    expect(evaluateValidators(rules, { ...facts, resultFileCount: 2 })).toEqual([]);
  });
});
