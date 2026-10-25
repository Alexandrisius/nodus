import type {
  TransitionDisplay,
  WorkflowCondition,
  WorkflowTransitionRules,
  WorkflowValidator,
} from '@nodus/contracts';

import { buildQuickWorkflow, QUICK_PROCESS_TYPE } from './system-catalog-quick.js';

/**
 * Системный каталог маршрутов (ADR-0020; ревизия 2 — редактор #378/ADR-0021,
 * ревизия 3 — колонка «На утверждении» шаблона «Моего плана», ADR-0020
 * дополнение 2): данные, которыми владеет код, — «засев один раз»
 * (CatalogBootstrap применяет ревизию только пока маршрут не правили руками,
 * `customizedAt`). Тип «Быстрый» — в system-catalog-quick.ts (лимит строк
 * I5). Цели route_if задаются КОДАМИ стадий (routeTo) — в БД хранится uuid
 * (резолв при посеве).
 */

export const CATALOG_REVISION = 3;

export interface CatalogStage {
  code: string;
  name: string;
  color: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
  systemState: 'backlog' | 'active' | 'paused' | 'done' | 'closed';
  outcome?: 'success' | 'cancelled';
  isInitial?: boolean;
}

export interface CatalogTransition {
  code: string;
  name: string;
  /** null — из любой стадии. */
  from: string | null;
  to: string;
  display: TransitionDisplay;
  rules: Partial<WorkflowTransitionRules>;
  /** Цель пост-функции route_if (код стадии; резолвится при посеве). */
  routeTo?: string;
}

export interface CatalogWorkflow {
  code: string;
  name: string;
  /** Вид маршрута = категория типа процесса (task | letter). */
  kind: 'task' | 'letter';
  stages: CatalogStage[];
  transitions: CatalogTransition[];
}

export interface CatalogProcessType {
  code: string;
  name: string;
  icon: string;
  color: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
  description: string;
  /** Порядок в библиотеке типов (дефолт выбора — первый). */
  sortOrder: number;
}

export const DEFAULT_SCHEME = { code: 'default', name: 'Схема по умолчанию' } as const;
export const DEFAULT_TASK_WORKFLOW_CODE = 'task.default';
export const QUICK_TASK_WORKFLOW_CODE = 'task.quick';

const assignee: WorkflowCondition = { kind: 'role_in', roles: ['assignee'] };
const creator: WorkflowCondition = { kind: 'role_in', roles: ['creator'] };
const doers: WorkflowCondition = { kind: 'role_in', roles: ['assignee', 'coexecutor'] };
const owners: WorkflowCondition = { kind: 'role_in', roles: ['assignee', 'creator'] };
const everyone: WorkflowCondition = {
  kind: 'role_in',
  roles: ['assignee', 'coexecutor', 'creator'],
};
const noOpenSubtasks: WorkflowValidator = { kind: 'no_open_subtasks' };

export const STAGE_NEW: CatalogStage = {
  code: 'new',
  name: 'Ожидает',
  color: 'neutral',
  systemState: 'backlog',
  isInitial: true,
};
export const STAGE_IN_PROGRESS: CatalogStage = {
  code: 'in_progress',
  name: 'В работе',
  color: 'success',
  systemState: 'active',
};
export const STAGE_PAUSED: CatalogStage = {
  code: 'paused',
  name: 'Приостановлена',
  color: 'warning',
  systemState: 'paused',
};
export const STAGE_POSTPONED: CatalogStage = {
  code: 'postponed',
  name: 'Отложена',
  color: 'neutral',
  systemState: 'paused',
};
export const STAGE_ON_CONTROL: CatalogStage = {
  code: 'on_control',
  name: 'На утверждении',
  color: 'warning',
  systemState: 'done',
};
export const STAGE_DONE: CatalogStage = {
  code: 'done',
  name: 'Завершена',
  color: 'info',
  systemState: 'closed',
  outcome: 'success',
};
export const STAGE_CANCELLED: CatalogStage = {
  code: 'cancelled',
  name: 'Отменена',
  color: 'danger',
  systemState: 'closed',
  outcome: 'cancelled',
};

const cancel = (): CatalogTransition => ({
  code: 'cancel',
  name: 'Отменить',
  from: null,
  to: 'cancelled',
  display: 'menu',
  rules: { conditions: [creator] },
});

const reopen = (): CatalogTransition => ({
  code: 'reopen',
  name: 'Восстановить',
  from: 'cancelled',
  to: 'new',
  display: 'button',
  rules: { conditions: [creator] },
});

export const STANDARD_PROCESS_TYPE: CatalogProcessType = {
  code: 'task',
  name: 'Стандартный',
  icon: 'square-check',
  color: 'neutral',
  description: 'С утверждением постановщиком',
  sortOrder: 0,
};

const STANDARD_WORKFLOW: CatalogWorkflow = {
  code: DEFAULT_TASK_WORKFLOW_CODE,
  name: 'Стандартный',
  kind: 'task',
  stages: [
    STAGE_NEW,
    STAGE_IN_PROGRESS,
    STAGE_PAUSED,
    STAGE_POSTPONED,
    STAGE_ON_CONTROL,
    STAGE_DONE,
    STAGE_CANCELLED,
  ],
  transitions: [
    {
      code: 'start',
      name: 'Взять в работу',
      from: 'new',
      to: 'in_progress',
      display: 'primary',
      rules: { conditions: [doers] },
    },
    {
      code: 'complete',
      name: 'Завершить',
      from: 'in_progress',
      to: 'on_control',
      display: 'primary',
      // Постановщик сам себе исполнитель — сразу «Завершена».
      rules: { conditions: [assignee], validators: [noOpenSubtasks] },
      routeTo: 'done',
    },
    {
      code: 'pause',
      name: 'Приостановить',
      from: 'in_progress',
      to: 'paused',
      display: 'button',
      rules: { conditions: [doers] },
    },
    {
      code: 'continue',
      name: 'Продолжить',
      from: 'paused',
      to: 'in_progress',
      display: 'primary',
      rules: { conditions: [doers] },
    },
    {
      code: 'postpone',
      name: 'Отложить',
      from: 'paused',
      to: 'postponed',
      display: 'button',
      rules: { conditions: [owners] },
    },
    {
      code: 'resume',
      name: 'Вернуть в работу',
      from: 'postponed',
      to: 'in_progress',
      display: 'primary',
      rules: { conditions: [everyone] },
    },
    {
      code: 'accept',
      name: 'Утвердить',
      from: 'on_control',
      to: 'done',
      display: 'primary',
      rules: { conditions: [creator], validators: [noOpenSubtasks] },
    },
    {
      code: 'return_control',
      name: 'Вернуть на доработку',
      from: 'on_control',
      to: 'in_progress',
      display: 'button',
      rules: { conditions: [creator] },
    },
    {
      code: 'return_done',
      name: 'Возобновить',
      from: 'done',
      to: 'in_progress',
      display: 'button',
      rules: { conditions: [owners] },
    },
    cancel(),
    reopen(),
  ],
};

/** Каталог задач: оба типа + маршруты (спека #378, раздел 10). */
export const CATALOG_PROCESS_TYPES: readonly {
  type: CatalogProcessType;
  workflow: CatalogWorkflow;
}[] = [
  { type: STANDARD_PROCESS_TYPE, workflow: STANDARD_WORKFLOW },
  {
    type: QUICK_PROCESS_TYPE,
    workflow: buildQuickWorkflow({
      newStage: STAGE_NEW,
      inProgress: STAGE_IN_PROGRESS,
      paused: STAGE_PAUSED,
      postponed: STAGE_POSTPONED,
      done: STAGE_DONE,
      cancelled: STAGE_CANCELLED,
    }),
  },
];

/** Пост-функции каталога: route_if с целью по коду стадии → uuid при посеве. */
export function catalogPostFunctions(
  t: CatalogTransition,
  stageIdByCode: Map<string, string>,
): WorkflowTransitionRules['postFunctions'] {
  if (!t.routeTo) return [];
  const target = stageIdByCode.get(t.routeTo);
  if (!target) return [];
  return [{ kind: 'route_if', when: 'creator_is_assignee', toStageId: target }];
}
