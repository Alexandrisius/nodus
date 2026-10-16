import type {
  WorkflowCondition,
  WorkflowPostFunction,
  WorkflowTransitionRules,
  WorkflowValidator,
} from '@nodus/contracts';

/**
 * Системный каталог маршрутов (ADR-0020) — данные, которыми ВЛАДЕЕТ код:
 * бутстрап модуля при старте создаёт недостающее и синхронизирует имена и
 * правила системных записей по `code` (пользовательские колонки «Моего
 * плана» и будущие маршруты редактора #38 не трогаются). Ступень 1 — один
 * тип «Задача»; типы работ ступени 2 добавятся сюда же записями.
 */

export interface CatalogStage {
  code: string;
  name: string;
  color: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
  systemState: 'backlog' | 'active' | 'paused' | 'done' | 'closed';
  isInitial?: boolean;
}

export interface CatalogTransition {
  code: string;
  name: string;
  /** null — из любой стадии. */
  from: string | null;
  to: string;
  rules: Partial<WorkflowTransitionRules>;
}

export interface CatalogWorkflow {
  code: string;
  name: string;
  kind: 'task' | 'personal';
  isTemplate?: boolean;
  stages: CatalogStage[];
  transitions: CatalogTransition[];
}

export const SYSTEM_TASK_TYPE = { code: 'task', name: 'Задача' } as const;
export const DEFAULT_SCHEME = { code: 'default', name: 'Схема по умолчанию' } as const;
export const DEFAULT_TASK_WORKFLOW_CODE = 'task.default';
export const PERSONAL_TEMPLATE_CODE = 'personal.template';

const assignee: WorkflowCondition = { kind: 'role_in', roles: ['assignee'] };
const creator: WorkflowCondition = { kind: 'role_in', roles: ['creator'] };
const doers: WorkflowCondition = { kind: 'role_in', roles: ['assignee', 'coexecutor'] };
const owners: WorkflowCondition = { kind: 'role_in', roles: ['assignee', 'creator'] };
const noOpenSubtasks: WorkflowValidator = { kind: 'no_open_subtasks' };
const routeToControl: WorkflowPostFunction = {
  kind: 'route_if_accept_required',
  stageCode: 'on_control',
};

const complete = (code: string, from: string): CatalogTransition => ({
  code,
  name: 'Завершить',
  from,
  to: 'done',
  rules: { conditions: [assignee], validators: [noOpenSubtasks], postFunctions: [routeToControl] },
});

export const DEFAULT_TASK_WORKFLOW: CatalogWorkflow = {
  code: DEFAULT_TASK_WORKFLOW_CODE,
  name: 'Задача',
  kind: 'task',
  stages: [
    { code: 'new', name: 'Новая', color: 'neutral', systemState: 'backlog', isInitial: true },
    { code: 'in_progress', name: 'В работе', color: 'success', systemState: 'active' },
    { code: 'on_control', name: 'Ждёт контроля', color: 'warning', systemState: 'done' },
    { code: 'done', name: 'Завершена', color: 'info', systemState: 'closed' },
    { code: 'postponed', name: 'Отложена', color: 'neutral', systemState: 'paused' },
    { code: 'cancelled', name: 'Отменена', color: 'danger', systemState: 'closed' },
  ],
  transitions: [
    {
      code: 'start',
      name: 'Начать',
      from: 'new',
      to: 'in_progress',
      rules: { conditions: [doers] },
    },
    {
      code: 'resume',
      name: 'Начать',
      from: 'postponed',
      to: 'in_progress',
      rules: { conditions: [doers] },
    },
    complete('complete', 'in_progress'),
    complete('complete_new', 'new'),
    {
      code: 'accept',
      name: 'Принять',
      from: 'on_control',
      to: 'done',
      rules: { conditions: [creator], validators: [noOpenSubtasks] },
    },
    {
      code: 'return_control',
      name: 'Вернуть в работу',
      from: 'on_control',
      to: 'in_progress',
      rules: { conditions: [creator] },
    },
    {
      code: 'return_done',
      name: 'Вернуть в работу',
      from: 'done',
      to: 'in_progress',
      // «Возобновить» завершённую — постановщик и ответственный (Битрикс24).
      rules: { conditions: [owners] },
    },
    {
      code: 'postpone',
      name: 'Отложить',
      from: 'in_progress',
      to: 'postponed',
      rules: { conditions: [owners] },
    },
    {
      code: 'postpone_new',
      name: 'Отложить',
      from: 'new',
      to: 'postponed',
      rules: { conditions: [owners] },
    },
    {
      code: 'reopen',
      name: 'Возобновить',
      from: 'cancelled',
      to: 'new',
      rules: { conditions: [creator] },
    },
    {
      code: 'cancel',
      name: 'Отменить',
      from: null,
      to: 'cancelled',
      rules: { conditions: [creator] },
    },
  ],
};

/** Шаблон «Моего плана» (ADR-0008): каждому состоянию — минимум одна колонка
 *  (автоперемещение). Переходов у личного маршрута нет. */
export const PERSONAL_TEMPLATE: CatalogWorkflow = {
  code: PERSONAL_TEMPLATE_CODE,
  name: 'Мой план',
  kind: 'personal',
  isTemplate: true,
  stages: [
    { code: 'backlog', name: 'Новые', color: 'neutral', systemState: 'backlog', isInitial: true },
    { code: 'active', name: 'В работе', color: 'success', systemState: 'active' },
    { code: 'paused', name: 'Отложенные', color: 'danger', systemState: 'paused' },
    { code: 'done', name: 'На контроле', color: 'warning', systemState: 'done' },
    { code: 'closed', name: 'Завершённые', color: 'info', systemState: 'closed' },
  ],
  transitions: [],
};
