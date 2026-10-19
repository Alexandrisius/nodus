import { z } from 'zod';

import { userRefSchema } from '../directory/user-ref.schema.js';
import {
  stageColorSchema,
  stageOutcomeSchema,
  taskSystemStateSchema,
  transitionDisplaySchema,
} from './workflow-primitives.schemas.js';
import { workflowTransitionRulesSchema } from './workflow.schemas.js';

/**
 * Документ маршрута — рабочая копия редактора (#378, ADR-0021): стадии и
 * переходы целиком, живёт на клиенте до публикации. Две формы: СТРОГАЯ
 * (граница публикации: имена обязательны, лимиты) и ЧЕРНОВИК (внутри
 * редактора: имена могут быть пустыми, лимиты не режутся — их нарушения
 * показывает живая проверка `checkWorkflowDocument`, а не zod).
 */

// docIdSchema (uuid | new:*) — примитив workflow-primitives: им пользуются
// и документ, и правила route_if (цель может быть новой стадией черновика).
export { docIdSchema } from './workflow-primitives.schemas.js';
export type { DocId } from './workflow-primitives.schemas.js';
import { docIdSchema } from './workflow-primitives.schemas.js';

/** Стадия черновика (пустое имя допустимо — проверка покажет empty_name). */
export const workflowDraftStageSchema = z.object({
  id: docIdSchema,
  /** Код системной стадии (только чтение; у новых — null, сервер не верит клиенту). */
  code: z.string().min(1).nullable(),
  name: z.string().max(40),
  color: stageColorSchema,
  systemState: taskSystemStateSchema,
  outcome: stageOutcomeSchema.nullable(),
  isInitial: z.boolean(),
  sortOrder: z.number().int().min(0),
});
export type WorkflowDraftStage = z.infer<typeof workflowDraftStageSchema>;

export const workflowDraftTransitionSchema = z.object({
  id: docIdSchema,
  code: z.string().min(1).nullable(),
  name: z.string().max(32),
  /** null — «из любого статуса». */
  fromStageId: docIdSchema.nullable(),
  toStageId: docIdSchema,
  display: transitionDisplaySchema,
  sortOrder: z.number().int().min(0),
  rules: workflowTransitionRulesSchema,
});
export type WorkflowDraftTransition = z.infer<typeof workflowDraftTransitionSchema>;

export const workflowDraftDocumentSchema = z.object({
  stages: z.array(workflowDraftStageSchema),
  transitions: z.array(workflowDraftTransitionSchema),
});
export type WorkflowDraftDocument = z.infer<typeof workflowDraftDocumentSchema>;

/** Документ на границе публикации: имена обязательны, лимиты схемы
 *  (больше 20 статусов / 80 кнопок сюда не проходит — но проверка
 *  `checkWorkflowDocument` сообщает об этом раньше, живыми подсказками). */
export const workflowDocStageSchema = workflowDraftStageSchema.extend({
  name: z.string().trim().min(1).max(40),
});
export const workflowDocTransitionSchema = workflowDraftTransitionSchema.extend({
  name: z.string().trim().min(1).max(32),
});

export const workflowDocumentSchema = z.object({
  stages: z.array(workflowDocStageSchema).min(1).max(20),
  transitions: z.array(workflowDocTransitionSchema).max(80),
});
export type WorkflowDocument = z.infer<typeof workflowDocumentSchema>;

/** `GET /tasks/workflows/:id` — документ маршрута + версия + счётчики задач
 *  по статусам (диалог публикации и сводка изменений). */
export const workflowDetailSchema = z.object({
  id: z.uuid(),
  /** Типы, использующие маршрут (схема «тип → маршрут»). */
  typeIds: z.array(z.uuid()),
  version: z.number().int().min(1),
  publishedAt: z.iso.datetime().nullable(),
  publishedBy: userRefSchema.nullable(),
  document: workflowDocumentSchema,
  /** Сколько задач в каждой стадии (uuid → count). */
  stageTaskCounts: z.record(z.uuid(), z.number().int().min(0)),
});
export type WorkflowDetail = z.infer<typeof workflowDetailSchema>;

/** Перенос задач архивируемой стадии (обязателен, если в стадии есть задачи;
 *  цель может быть новой стадией документа — docId). */
export const workflowMigrationSchema = z.object({
  fromStageId: z.uuid(),
  toStageId: docIdSchema,
});
export type WorkflowMigration = z.infer<typeof workflowMigrationSchema>;

/** `POST /tasks/workflows/:id/publish` — публикация с оптимистичной
 *  версией (несовпадение → 409 WORKFLOW_VERSION_CONFLICT). */
export const publishWorkflowBodySchema = z.object({
  baseVersion: z.number().int().min(1),
  document: workflowDocumentSchema,
  migrations: z.array(workflowMigrationSchema).max(20).default([]),
});
export type PublishWorkflowBody = z.infer<typeof publishWorkflowBodySchema>;

export const publishWorkflowResultSchema = z.object({
  version: z.number().int().min(1),
  publishedAt: z.iso.datetime(),
  /** Сколько задач поставлено в фоновый перенос (BullMQ). */
  scheduledMoves: z.number().int().min(0),
});
export type PublishWorkflowResult = z.infer<typeof publishWorkflowResultSchema>;

/** Коды проблем схемы маршрута: ошибки запрещают публикацию, предупреждения
 *  — нет. Тексты — i18n `ui.automation.problems.<code>`; список закрыт
 *  (расширение = новое правило проверки там же). */
export const workflowProblemCodeSchema = z.enum([
  'no_initial',
  'multiple_initial',
  'unreachable_stage',
  'dead_end_stage',
  'no_closed_stage',
  'empty_name',
  'duplicate_stage_name',
  'duplicate_button_name',
  'self_loop',
  'no_roles',
  'multiple_primary',
  'route_if_invalid',
  'outcome_mismatch',
  'too_many_stages',
  'too_many_transitions',
  'no_primary',
  'closed_without_exit',
  'duplicate_with_any',
]);
export type WorkflowProblemCode = z.infer<typeof workflowProblemCodeSchema>;

export const workflowProblemSchema = z.object({
  code: workflowProblemCodeSchema,
  severity: z.enum(['error', 'warning']),
  stageId: docIdSchema.optional(),
  transitionId: docIdSchema.optional(),
});
export type WorkflowProblem = z.infer<typeof workflowProblemSchema>;
