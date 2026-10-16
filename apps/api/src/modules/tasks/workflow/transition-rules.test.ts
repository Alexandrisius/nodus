import { describe, expect, it } from 'vitest';
import { Permission } from '@nodus/contracts';

import {
  effectiveTargetId,
  evaluateValidators,
  outgoingTransitions,
  parseRules,
  passesConditions,
  type StageDef,
  type TaskGateFacts,
  type TransitionDef,
} from './transition-rules.js';

const facts: TaskGateFacts = {
  stageId: 's-work',
  acceptRequired: false,
  openSubtasks: 0,
  checklistDone: 2,
  checklistTotal: 2,
  spentMinutes: 30,
  description: 'Сделать',
  deadline: new Date(),
  assigneeId: 'u1',
  plannedMinutes: null,
  hasResult: false,
};

const stages: StageDef[] = [
  { id: 's-work', code: 'in_progress', name: 'В работе', systemState: 'active', archivedAt: null },
  {
    id: 's-ctrl',
    code: 'on_control',
    name: 'Ждёт контроля',
    systemState: 'done',
    archivedAt: null,
  },
  { id: 's-done', code: 'done', name: 'Завершена', systemState: 'closed', archivedAt: null },
];

function transition(partial: Partial<TransitionDef>): TransitionDef {
  return {
    id: 't',
    name: 'Завершить',
    fromStageId: 's-work',
    toStageId: 's-done',
    sortOrder: 0,
    rules: parseRules({}),
    ...partial,
  };
}

describe('passesConditions', () => {
  const rules = parseRules({ conditions: [{ kind: 'role_in', roles: ['assignee'] }] });

  it('роль из списка — проходит, чужая — нет', () => {
    expect(passesConditions(rules, { roles: new Set(['assignee']), permissions: [] })).toBe(true);
    expect(passesConditions(rules, { roles: new Set(['observer']), permissions: [] })).toBe(false);
  });

  it('task.manage_any проходит любые условия', () => {
    const actor = { roles: new Set<never>(), permissions: [Permission.TASK_MANAGE_ANY] };
    expect(passesConditions(rules, actor)).toBe(true);
  });

  it('пустые условия — постановщик или ответственный', () => {
    const empty = parseRules({});
    expect(passesConditions(empty, { roles: new Set(['creator']), permissions: [] })).toBe(true);
    expect(passesConditions(empty, { roles: new Set(['coexecutor']), permissions: [] })).toBe(
      false,
    );
  });
});

describe('evaluateValidators (гейты DoR/DoD)', () => {
  it('открытые подзадачи блокируют с количеством', () => {
    const rules = parseRules({ validators: [{ kind: 'no_open_subtasks' }] });
    expect(evaluateValidators(rules, { ...facts, openSubtasks: 3 })).toEqual([
      { kind: 'no_open_subtasks', count: 3 },
    ]);
    expect(evaluateValidators(rules, facts)).toEqual([]);
  });

  it('чек-лист, время, результат и обязательные поля', () => {
    const rules = parseRules({
      validators: [
        { kind: 'checklist_complete' },
        { kind: 'time_logged' },
        { kind: 'result_present' },
        { kind: 'fields_required', fields: ['description', 'plannedMinutes'] },
      ],
    });
    const reasons = evaluateValidators(rules, {
      ...facts,
      checklistDone: 1,
      spentMinutes: 0,
      description: '  ',
    });
    expect(reasons.map((r) => r.kind)).toEqual([
      'checklist_complete',
      'time_logged',
      'result_present',
      'fields_required',
    ]);
    expect(reasons[3]?.fields).toEqual(['description', 'plannedMinutes']);
  });

  it('неизвестный вид правила отвергается при разборе', () => {
    expect(() => parseRules({ validators: [{ kind: 'magic' }] })).toThrow();
  });
});

describe('цель перехода и исходящие', () => {
  const complete = transition({
    rules: parseRules({
      postFunctions: [{ kind: 'route_if_accept_required', stageCode: 'on_control' }],
    }),
  });

  it('«принять после завершения» уводит в стадию контроля', () => {
    expect(effectiveTargetId(complete, { acceptRequired: true }, stages)).toBe('s-ctrl');
    expect(effectiveTargetId(complete, { acceptRequired: false }, stages)).toBe('s-done');
  });

  it('из любой стадии + из текущей, без петли, по порядку', () => {
    const list = outgoingTransitions(
      [
        transition({ id: 'b', sortOrder: 2 }),
        transition({ id: 'any', fromStageId: null, toStageId: 's-ctrl', sortOrder: 1 }),
        transition({ id: 'loop', fromStageId: null, toStageId: 's-work' }),
        transition({ id: 'other', fromStageId: 's-ctrl' }),
      ],
      facts,
      stages,
    );
    expect(list.map((t) => t.id)).toEqual(['any', 'b']);
  });
});
