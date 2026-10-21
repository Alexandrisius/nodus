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

/** Точка подключения стрелки на статусе: сторона (t/r/b/l) + слот 1..3 —
 *  12 точек, как в редакторе Яндекс Трекера (#378, ред. 2). */
export const flowHandleIdSchema = z.enum([
  't1',
  't2',
  't3',
  'r1',
  'r2',
  'r3',
  'b1',
  'b2',
  'b3',
  'l1',
  'l2',
  'l3',
]);
export type FlowHandleId = z.infer<typeof flowHandleIdSchema>;

const flowCoordSchema = z.number().finite().min(-100_000).max(100_000);
export const flowPointSchema = z.object({ x: flowCoordSchema, y: flowCoordSchema });
export type FlowPoint = z.infer<typeof flowPointSchema>;

export const workflowLayoutTransitionSchema = z.object({
  sourceHandle: flowHandleIdSchema.optional(),
  targetHandle: flowHandleIdSchema.optional(),
  /** Положение подписи вдоль стрелки: 0 — у источника, 1 — у цели. */
  labelT: z.number().min(0).max(1).optional(),
  /** Метка «Любой статус» кнопки из любого статуса — позиция на холсте. */
  anchor: flowPointSchema.optional(),
  /** Глубина обхода U-стрелки (вход и выход с одной стороны), px холста:
   *  фиксируется, чтобы перестановка соседей не перестраивала стрелку. */
  offset: z.number().int().min(0).max(400).optional(),
  /** Сдвиг свободного участка «ступеньки»/обхода «за спиной» от авто-
   *  положения, px холста: стрелку отодвинули вручную (#395). */
  shift: z.number().int().min(-2000).max(2000).optional(),
});
export type WorkflowLayoutTransition = z.infer<typeof workflowLayoutTransitionSchema>;

/** Раскладка холста — ОБЩАЯ для всех: позиции статусов, точки подключения,
 *  подписи, глубины обходов. Это оформление, не маршрут: сохраняется сразу,
 *  БЕЗ новой версии (`PUT .../layout`), а записи новых элементов (new:*) —
 *  вместе с их публикацией. Нет записи элемента — авторасстановка. */
export const workflowLayoutSchema = z
  .object({
    stages: z.record(docIdSchema, flowPointSchema),
    transitions: z.record(docIdSchema, workflowLayoutTransitionSchema),
  })
  .refine((v) => Object.keys(v.stages).length <= 40 && Object.keys(v.transitions).length <= 160, {
    message: 'layout too large',
  });
export type WorkflowLayout = z.infer<typeof workflowLayoutSchema>;

export const workflowDraftDocumentSchema = z.object({
  stages: z.array(workflowDraftStageSchema),
  transitions: z.array(workflowDraftTransitionSchema),
  layout: workflowLayoutSchema.optional(),
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
  layout: workflowLayoutSchema.optional(),
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

/** `PUT /tasks/workflows/:id/layout` — расстановка холста сохраняется сразу,
 *  без новой версии маршрута (#378 ред. 2, вердикт владельца 20.10:
 *  перестановка «для красоты» версию не выпускает). Записи удалённых и
 *  new:* элементов сервер отбрасывает; ответ — сохранённая раскладка. */
export const saveWorkflowLayoutBodySchema = z.object({ layout: workflowLayoutSchema });
export type SaveWorkflowLayoutBody = z.infer<typeof saveWorkflowLayoutBodySchema>;

export const saveWorkflowLayoutResultSchema = z.object({ layout: workflowLayoutSchema });
export type SaveWorkflowLayoutResult = z.infer<typeof saveWorkflowLayoutResultSchema>;

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
