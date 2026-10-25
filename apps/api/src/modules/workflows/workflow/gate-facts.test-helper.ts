import type { WorkflowGateFacts } from '../../../core/ports/workflow-entity.port.js';

/**
 * Факты гейтов для unit-тестов движка: полный набор полей с нейтральными
 * значениями и переопределением нужных кейсу. Один источник — тесты правил,
 * окна и ключей `cf.<id>` не расходятся в форме фактов.
 */
export function gateFacts(overrides: Partial<WorkflowGateFacts> = {}): WorkflowGateFacts {
  return {
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
    assigneeId: null,
    plannedMinutes: null,
    hasResult: false,
    resultFileCount: 0,
    customFields: {},
    activeCustomFieldIds: new Set<string>(),
    ...overrides,
  };
}
