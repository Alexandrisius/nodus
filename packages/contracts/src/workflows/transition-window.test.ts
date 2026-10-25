import { describe, expect, it } from 'vitest';

import type { TransitionForm } from './transition-form.schemas.js';
import {
  effectiveWindowSections,
  gateFixableBy,
  requiredWindowSections,
} from './transition-window.js';
import { workflowTransitionRulesSchema, type WorkflowValidator } from './workflow.schemas.js';

const form = (sections: TransitionForm['sections']): TransitionForm => ({
  enabled: true,
  sections,
});

const rules = (validators: WorkflowValidator[]) =>
  workflowTransitionRulesSchema.parse({ validators });

describe('effectiveWindowSections (#380, Р4)', () => {
  it('окно выключено — только разделы из гейтов, в фиксированном порядке', () => {
    const sections = effectiveWindowSections(
      null,
      rules([
        { kind: 'time_logged' },
        { kind: 'result_files', min: 2 },
        { kind: 'fields_required', fields: ['deadline', 'result'] },
      ]),
    );
    expect(sections.map((s) => s.kind)).toEqual(['fields', 'time', 'result', 'result_files']);
    expect(sections.every((s) => s.origin === 'gate')).toBe(true);
  });

  it('настройка ∪ гейты: поля сливаются, подпись раздела — из настройки', () => {
    const sections = effectiveWindowSections(
      form([
        { kind: 'fields', fields: ['assignee'] },
        { kind: 'result_files', label: 'Акт' },
        { kind: 'comment', label: 'Причина', required: true },
      ]),
      rules([{ kind: 'fields_required', fields: ['deadline'] }, { kind: 'result_present' }]),
    );
    expect(sections.map((s) => s.kind)).toEqual(['fields', 'result', 'result_files', 'comment']);
    expect(sections[0]).toMatchObject({
      kind: 'fields',
      fields: ['assignee', 'deadline'],
      origin: 'form',
    });
    expect(sections[2]).toMatchObject({ kind: 'result_files', label: 'Акт', origin: 'form' });
    expect(sections[3]).toMatchObject({ kind: 'comment', label: 'Причина', required: true });
  });

  it('обязательные разделы окна — причина и сообщения', () => {
    const sections = effectiveWindowSections(
      form([
        { kind: 'comment', label: 'Причина', required: true },
        { kind: 'result_messages', required: true },
      ]),
      rules([]),
    );
    expect(requiredWindowSections(sections)).toEqual(['result_messages', 'comment']);
  });
});

describe('gateFixableBy (#380)', () => {
  it('исправимые окном гейты и неисправимые', () => {
    expect(gateFixableBy('fields_required')).toBe('fields');
    expect(gateFixableBy('time_logged')).toBe('time');
    expect(gateFixableBy('result_present')).toBe('result');
    expect(gateFixableBy('result_files')).toBe('result_files');
    expect(gateFixableBy('no_open_subtasks')).toBeNull();
    expect(gateFixableBy('checklist_complete')).toBeNull();
  });
});
