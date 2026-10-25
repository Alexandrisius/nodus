import { z } from 'zod';

import { processCategorySchema } from '../workflows/process-type.schemas.js';

/**
 * Каталог доменных событий модуля «Процессы» (ADR-0024, I9; каталог
 * api-conventions.md, только расширяется). Каталожные события — без
 * `audience`: gateway рассылает их всем авторизованным сокетам (комната
 * presence), клиенты инвалидируют типы, статусы и маршруты. Payload
 * минимальный: подробности — GET /workflows/types, /workflows/:id.
 * Прежние имена `task.type_*` / `task.workflow_*` зарезервированы и не
 * эмитятся (#428); история задач читает старые записи event log.
 */
export const WORKFLOW_EVENTS = {
  TYPE_CREATED: 'workflow.type_created',
  TYPE_UPDATED: 'workflow.type_updated',
  TYPE_ARCHIVED: 'workflow.type_archived',
  PUBLISHED: 'workflow.published',
  LAYOUT_CHANGED: 'workflow.layout_changed',
} as const;

export type WorkflowEventType = (typeof WORKFLOW_EVENTS)[keyof typeof WORKFLOW_EVENTS];

/** Каталожные события «Процессов» — явный список для gateway (у ADR-0025
 *  будут некаталожные `workflow.*` с собственной адресацией). */
export const WORKFLOW_CATALOG_EVENTS: readonly string[] = [
  WORKFLOW_EVENTS.TYPE_CREATED,
  WORKFLOW_EVENTS.TYPE_UPDATED,
  WORKFLOW_EVENTS.TYPE_ARCHIVED,
  WORKFLOW_EVENTS.PUBLISHED,
  WORKFLOW_EVENTS.LAYOUT_CHANGED,
];

export const workflowTypeCreatedPayloadSchema = z.object({
  typeId: z.uuid(),
  name: z.string(),
  category: processCategorySchema,
});
export type WorkflowTypeCreatedPayload = z.infer<typeof workflowTypeCreatedPayloadSchema>;

export const workflowTypeUpdatedPayloadSchema = z.object({
  typeId: z.uuid(),
  /** Изменённые ключи свойств типа. */
  fields: z.array(z.string()),
});
export type WorkflowTypeUpdatedPayload = z.infer<typeof workflowTypeUpdatedPayloadSchema>;

export const workflowTypeArchivedPayloadSchema = z.object({
  typeId: z.uuid(),
});
export type WorkflowTypeArchivedPayload = z.infer<typeof workflowTypeArchivedPayloadSchema>;

export const workflowPublishedPayloadSchema = z.object({
  workflowId: z.uuid(),
  /** Типы, идущие по маршруту. */
  typeIds: z.array(z.uuid()),
  version: z.number().int().min(1),
  /** Категория сущностей маршрута: по ней outbox-обработчик выбирает
   *  адаптер модуля-владельца (ADR-0024). */
  category: processCategorySchema,
  /** Переносы сущностей из архивированных статусов (≤ 20) — вход фонового
   *  задания: его ставит outbox-обработчик события (доставка at-least-once). */
  moves: z.array(z.object({ fromStageId: z.uuid(), toStageId: z.uuid() })),
  /** Статусы со сменой группы (сущности пересчитываются фоном). */
  restates: z.array(z.object({ stageId: z.uuid(), systemState: z.string() })),
});
export type WorkflowPublishedPayload = z.infer<typeof workflowPublishedPayloadSchema>;

export const workflowLayoutChangedPayloadSchema = z.object({
  workflowId: z.uuid(),
});
export type WorkflowLayoutChangedPayload = z.infer<typeof workflowLayoutChangedPayloadSchema>;
