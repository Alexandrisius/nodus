import { describe, expect, it } from 'vitest';

import { gateFacts } from './gate-facts.test-helper.js';
import { evaluateValidators, parseRules } from './transition-rules.js';

const facts = gateFacts({ assigneeId: 'u1' });

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
