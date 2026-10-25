import type { ProcessType, WorkflowDetail } from '@nodus/contracts';

import { quickDocument, simpleDocument, standardDocument } from './workflows-documents.js';

import { quickProcessType, systemProcessType } from './task-stages.js';

/** Библиотека типов задач и их маршрутов (ревизия 2, #378) — мок-данные
 *  «Автоматизации»: два системных типа + архивный демо-тип. Документы —
 *  зеркало каталога API revision 2 (system-catalog.ts). */

export { quickDocument, standardDocument } from './workflows-documents.js';

const wid = (n: number): string =>
  `20000000-0000-4000-8000-0000000009${String(n).padStart(2, '0')}`;
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
