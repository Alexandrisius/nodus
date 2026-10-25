import type { ProcessType, WorkflowDetail, WorkflowDocument } from '@nodus/contracts';

import {
  quickProcessType,
  stageCancelled,
  stageDone,
  stageInProgress,
  stageNew,
  stageOnControl,
  stagePaused,
  stagePostponed,
  systemProcessType,
} from './task-stages.js';

/** Библиотека типов задач и их маршрутов (ревизия 2, #378) — мок-данные
 *  «Автоматизации»: два системных типа + архивный демо-тип. Документы —
 *  зеркало каталога API revision 2 (system-catalog.ts). */

const wid = (n: number): string =>
  `20000000-0000-4000-8000-0000000009${String(n).padStart(2, '0')}`;
const trid = (code: string): string =>
  `30000000-0000-4000-8000-${code.padEnd(12, '0').slice(0, 12)}`;

export const STANDARD_WORKFLOW_ID = wid(50);
export const QUICK_WORKFLOW_ID = wid(51);
export const ARCHIVED_WORKFLOW_ID = wid(52);

export const standardProcessType: ProcessType = {
  id: systemProcessType.id,
  code: 'task',
  name: 'Стандартный',
  icon: 'square-check',
  color: 'neutral',
  description: 'С утверждением постановщиком',
  creatable: true,
  category: 'task',
  direction: null,
  isSystem: true,
  sortOrder: 0,
  archivedAt: null,
  workflowId: STANDARD_WORKFLOW_ID,
};

export const quickTypeDto: ProcessType = {
  id: quickProcessType.id,
  code: 'quick',
  name: 'Быстрый',
  icon: 'zap',
  color: 'success',
  description: 'Без утверждения — для мелких поручений',
  creatable: true,
  category: 'task',
  direction: null,
  isSystem: true,
  sortOrder: 1,
  archivedAt: null,
  workflowId: QUICK_WORKFLOW_ID,
};

export const archivedDemoType: ProcessType = {
  id: '20000000-0000-4000-8000-000000000902',
  code: 'custom-check-docs',
  name: 'Проверка документации',
  icon: 'clipboard-check',
  color: 'warning',
  description: 'Старый маршрут проверки',
  creatable: false,
  category: 'task',
  direction: null,
  isSystem: false,
  sortOrder: 2,
  archivedAt: '2026-10-01T10:00:00Z',
  workflowId: ARCHIVED_WORKFLOW_ID,
};

export const demoProcessTypes: ProcessType[] = [
  standardProcessType,
  quickTypeDto,
  archivedDemoType,
];

/** Правила-сокращения ревизии 2. */
import type { WorkflowCondition, WorkflowValidator } from '@nodus/contracts';
const doers: WorkflowCondition = { kind: 'role_in', roles: ['assignee', 'coexecutor'] };
const executor: WorkflowCondition = { kind: 'role_in', roles: ['assignee'] };
const creator: WorkflowCondition = { kind: 'role_in', roles: ['creator'] };
const owners: WorkflowCondition = { kind: 'role_in', roles: ['assignee', 'creator'] };
const allHands: WorkflowCondition = {
  kind: 'role_in',
  roles: ['assignee', 'coexecutor', 'creator'],
};
const noOpenSubtasks: WorkflowValidator = { kind: 'no_open_subtasks' };

/** «Стандартный» (task.default): Ожидает → В работе → На утверждении →
 *  Завершена; Приостановлена/Отложена; Отменена. Кнопка «Отменить» —
 *  «из любого», в меню, у постановщика (решения владельца 4–6). */
export const standardDocument: WorkflowDocument = {
  stages: [
    { ...stageNew, code: 'new', outcome: null, isInitial: true, sortOrder: 0 },
    { ...stageInProgress, code: 'in_progress', outcome: null, isInitial: false, sortOrder: 0 },
    { ...stagePaused, code: 'paused', outcome: null, isInitial: false, sortOrder: 0 },
    { ...stagePostponed, code: 'postponed', outcome: null, isInitial: false, sortOrder: 1 },
    { ...stageOnControl, code: 'on_control', outcome: null, isInitial: false, sortOrder: 0 },
    { ...stageDone, code: 'done', outcome: 'success', isInitial: false, sortOrder: 0 },
    { ...stageCancelled, code: 'cancelled', outcome: 'cancelled', isInitial: false, sortOrder: 1 },
  ],
  transitions: [
    {
      id: trid('start'),
      code: 'start',
      name: 'Взять в работу',
      fromStageId: stageNew.id,
      toStageId: stageInProgress.id,
      display: 'primary',
      sortOrder: 0,
      rules: { conditions: [doers], validators: [], postFunctions: [] },
    },
    {
      id: trid('complete'),
      code: 'complete',
      name: 'Завершить',
      fromStageId: stageInProgress.id,
      toStageId: stageOnControl.id,
      display: 'primary',
      sortOrder: 0,
      rules: {
        conditions: [executor],
        validators: [noOpenSubtasks],
        postFunctions: [{ kind: 'route_if', when: 'creator_is_assignee', toStageId: stageDone.id }],
      },
    },
    {
      id: trid('pause'),
      code: 'pause',
      name: 'Приостановить',
      fromStageId: stageInProgress.id,
      toStageId: stagePaused.id,
      display: 'button',
      sortOrder: 1,
      rules: { conditions: [doers], validators: [], postFunctions: [] },
    },
    {
      id: trid('continue'),
      code: 'continue',
      name: 'Продолжить',
      fromStageId: stagePaused.id,
      toStageId: stageInProgress.id,
      display: 'primary',
      sortOrder: 0,
      rules: { conditions: [doers], validators: [], postFunctions: [] },
    },
    {
      id: trid('postpone'),
      code: 'postpone',
      name: 'Отложить',
      fromStageId: stagePaused.id,
      toStageId: stagePostponed.id,
      display: 'button',
      sortOrder: 1,
      rules: { conditions: [owners], validators: [], postFunctions: [] },
    },
    {
      id: trid('resume'),
      code: 'resume',
      name: 'Вернуть в работу',
      fromStageId: stagePostponed.id,
      toStageId: stageInProgress.id,
      display: 'primary',
      sortOrder: 0,
      rules: { conditions: [allHands], validators: [], postFunctions: [] },
    },
    {
      id: trid('accept'),
      code: 'accept',
      name: 'Утвердить',
      fromStageId: stageOnControl.id,
      toStageId: stageDone.id,
      display: 'primary',
      sortOrder: 0,
      rules: { conditions: [creator], validators: [noOpenSubtasks], postFunctions: [] },
    },
    {
      id: trid('return_control'),
      code: 'return_control',
      name: 'Вернуть на доработку',
      fromStageId: stageOnControl.id,
      toStageId: stageInProgress.id,
      display: 'button',
      sortOrder: 1,
      rules: { conditions: [creator], validators: [], postFunctions: [] },
    },
    {
      id: trid('return_done'),
      code: 'return_done',
      name: 'Возобновить',
      fromStageId: stageDone.id,
      toStageId: stageInProgress.id,
      display: 'button',
      sortOrder: 0,
      rules: { conditions: [owners], validators: [], postFunctions: [] },
    },
    {
      id: trid('cancel'),
      code: 'cancel',
      name: 'Отменить',
      fromStageId: null,
      toStageId: stageCancelled.id,
      display: 'menu',
      sortOrder: 0,
      rules: { conditions: [creator], validators: [], postFunctions: [] },
    },
    {
      id: trid('reopen'),
      code: 'reopen',
      name: 'Восстановить',
      fromStageId: stageCancelled.id,
      toStageId: stageNew.id,
      display: 'button',
      sortOrder: 0,
      rules: { conditions: [creator], validators: [], postFunctions: [] },
    },
  ],
};

/** «Быстрый» (task.quick): без «На утверждении»; можно завершить прямо из
 *  «Ожидает». */
export const quickDocument: WorkflowDocument = {
  stages: standardDocument.stages.filter((s) => s.code !== 'on_control'),
  transitions: [
    standardDocument.transitions.find((t) => t.code === 'start')!,
    {
      id: trid('complete'),
      code: 'complete',
      name: 'Завершить',
      fromStageId: stageInProgress.id,
      toStageId: stageDone.id,
      display: 'primary',
      sortOrder: 0,
      rules: { conditions: [executor], validators: [noOpenSubtasks], postFunctions: [] },
    },
    {
      id: trid('complete_waiting'),
      code: 'complete_waiting',
      name: 'Завершить',
      fromStageId: stageNew.id,
      toStageId: stageDone.id,
      display: 'button',
      sortOrder: 1,
      rules: { conditions: [executor], validators: [noOpenSubtasks], postFunctions: [] },
    },
    ...(
      ['pause', 'continue', 'postpone', 'resume', 'return_done', 'cancel', 'reopen'] as const
    ).map((code) => standardDocument.transitions.find((t) => t.code === code)!),
  ],
};

/** Простой документ архивного демо-типа: Ожидает → В работе → Завершена. */
const simpleDocument: WorkflowDocument = {
  stages: [
    { ...stageNew, code: 'new', outcome: null, isInitial: true, sortOrder: 0 },
    { ...stageInProgress, code: 'in_progress', outcome: null, isInitial: false, sortOrder: 0 },
    { ...stageDone, code: 'done', outcome: 'success', isInitial: false, sortOrder: 0 },
  ],
  transitions: [
    {
      id: trid('start'),
      code: 'start',
      name: 'Взять в работу',
      fromStageId: stageNew.id,
      toStageId: stageInProgress.id,
      display: 'primary',
      sortOrder: 0,
      rules: { conditions: [executor], validators: [], postFunctions: [] },
    },
    {
      id: trid('complete'),
      code: 'complete',
      name: 'Завершить',
      fromStageId: stageInProgress.id,
      toStageId: stageDone.id,
      display: 'primary',
      sortOrder: 0,
      rules: { conditions: [executor], validators: [], postFunctions: [] },
    },
  ],
};

const publishedAt = '2026-10-18T14:05:00Z';
const publishedBy = {
  id: '00000000-0000-4000-8000-000000000001',
  displayName: 'Климович А.',
  avatarUrl: null,
};

export const demoWorkflowDetails: Record<string, WorkflowDetail> = {
  [STANDARD_WORKFLOW_ID]: {
    id: STANDARD_WORKFLOW_ID,
    typeIds: [standardProcessType.id],
    version: 3,
    publishedAt,
    publishedBy,
    document: standardDocument,
    stageEntityCounts: {},
  },
  [QUICK_WORKFLOW_ID]: {
    id: QUICK_WORKFLOW_ID,
    typeIds: [quickTypeDto.id],
    version: 2,
    publishedAt,
    publishedBy,
    document: quickDocument,
    stageEntityCounts: {},
  },
  [ARCHIVED_WORKFLOW_ID]: {
    id: ARCHIVED_WORKFLOW_ID,
    typeIds: [archivedDemoType.id],
    version: 1,
    publishedAt,
    publishedBy: null,
    document: simpleDocument,
    stageEntityCounts: {},
  },
};
