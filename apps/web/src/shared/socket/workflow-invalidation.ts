import type { QueryClient } from '@tanstack/react-query';
import { WORKFLOW_EVENTS } from '@nodus/contracts';

import { automationKeys } from '../api/automation-keys.js';
import { tasksKeys } from '../api/tasks-keys.js';
import { workflowKeys } from '../workflow/workflow-api.js';
import type { KeyBatcher } from './invalidation-batcher.js';

/** Каталожные события «Процессов» (#428, ADR-0024): рассылаются всем —
 *  инвалидируются каталоги (типы, стадии, маршруты) и переходы всех задач
 *  (кнопки зависят от маршрута). Явный список: у ADR-0025 будут некаталожные
 *  workflow.* с другой адресацией. */
const CATALOG_EVENTS = new Set<string>([
  WORKFLOW_EVENTS.TYPE_CREATED,
  WORKFLOW_EVENTS.TYPE_UPDATED,
  WORKFLOW_EVENTS.TYPE_ARCHIVED,
  WORKFLOW_EVENTS.PUBLISHED,
]);

/** Ключи кэша по событию `workflow.*`. true — событие обработано здесь,
 *  false — не наше (роутер пробует дальше). */
export function pushWorkflowKeys(
  batcher: KeyBatcher,
  queryClient: QueryClient,
  type: string,
  payload: Record<string, unknown>,
): boolean {
  // Расстановка холста (без новой версии): только документ этого маршрута —
  // «Схема маршрута» и список типов; кнопки и задачи не меняются.
  if (type === WORKFLOW_EVENTS.LAYOUT_CHANGED) {
    if (typeof payload.workflowId === 'string') {
      batcher.push(workflowKeys.detail(payload.workflowId), 'list');
    }
    return true;
  }
  // Каталожные события: каталоги типов/стадий/маршрутов и переходы всех задач.
  if (CATALOG_EVENTS.has(type)) {
    batcher.push(automationKeys.all, 'list');
    batcher.push(workflowKeys.all, 'list');
    batcher.push(tasksKeys.stages(), 'list');
    batcher.push([tasksKeys.all[0], 'transitions'], 'list');
    batcher.push(tasksKeys.listPages(), 'list');
    // Настройки типа (#432) меняют состав карточки (`layout` в детали):
    // открытые карточки задач перечитываются, а не живут со старым составом.
    if (type === WORKFLOW_EVENTS.TYPE_UPDATED) {
      batcher.push(tasksKeys.detailsAll(), 'list');
    }
    return true;
  }
  return false;
}
