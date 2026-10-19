import { z } from 'zod';

import { stageOutcomeSchema, transitionDisplaySchema } from './workflow-primitives.schemas.js';

/**
 * Движок маршрутов задач (ADR-0020): глобальный тип → маршрут (стадии +
 * переходы с правилами) через схему «тип → маршрут». Реестр видов правил
 * ЗАКРЫТ: новый вид = расширение union + обработчик в сервисе; сервер
 * отвергает неизвестный вид при чтении (правило в данных без исполнителя в
 * коде — ложная безопасность). Типы задач — `task-type.schemas.ts`; документ
 * редактора — `workflow-document.schemas.ts`.
 */

/** Роль пользователя относительно задачи (вход условий переходов и прав). */
export const taskActorRoleSchema = z.enum(['creator', 'assignee', 'coexecutor', 'observer']);
export type TaskActorRole = z.infer<typeof taskActorRoleSchema>;

/** Поля задачи, которые могут требовать гейты `fields_required` (DoR/DoD). */
export const taskRequirableFieldSchema = z.enum([
  'description',
  'deadline',
  'assignee',
  'plannedMinutes',
  'result',
]);
export type TaskRequirableField = z.infer<typeof taskRequirableFieldSchema>;

/** Условия — КТО видит и может нажать кнопку перехода. Пустой список —
 *  любой, кто может править задачу. Несколько условий — ИЛИ. */
export const workflowConditionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('role_in'), roles: z.array(taskActorRoleSchema).min(1) }),
  z.object({ kind: z.literal('permission'), permission: z.string().min(1) }),
]);
export type WorkflowCondition = z.infer<typeof workflowConditionSchema>;

/** Валидаторы — гейты DoR/DoD: все должны пройти (И). */
export const workflowValidatorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('no_open_subtasks') }),
  z.object({ kind: z.literal('checklist_complete') }),
  z.object({
    kind: z.literal('fields_required'),
    fields: z.array(taskRequirableFieldSchema).min(1),
  }),
  z.object({ kind: z.literal('time_logged') }),
  z.object({ kind: z.literal('result_present') }),
]);
export type WorkflowValidator = z.infer<typeof workflowValidatorSchema>;
export type WorkflowValidatorKind = WorkflowValidator['kind'];

/** Пост-действия — что сделать после перехода (в той же транзакции).
 *  Встроенное (не правило): completedAt ставится входом в done/closed и
 *  снимается выходом; личные доски участников переезжают по состоянию. */
export const workflowPostFunctionSchema = z.discriminatedUnion('kind', [
  /** УСТАРЕВШИЙ (#378): ветвление по флагу задачи «принять после завершения»
   *  (accept_required уходит, ADR-0020 дополнение); остаётся только в
   *  архивных переходах истории — новые маршруты его не несут. */
  z.object({ kind: z.literal('route_if_accept_required'), stageCode: z.string().min(1) }),
  /** Если условие выполнено, цель подменяется стадией `toStageId` —
   *  утверждение пропускается, когда постановщик сам себе исполнитель (#378). */
  z.object({
    kind: z.literal('route_if'),
    when: z.literal('creator_is_assignee'),
    toStageId: z.uuid(),
  }),
]);
export type WorkflowPostFunction = z.infer<typeof workflowPostFunctionSchema>;

export const workflowTransitionRulesSchema = z.object({
  conditions: z.array(workflowConditionSchema).default([]),
  validators: z.array(workflowValidatorSchema).default([]),
  postFunctions: z.array(workflowPostFunctionSchema).default([]),
});
export type WorkflowTransitionRules = z.infer<typeof workflowTransitionRulesSchema>;

/** Причина, по которой переход недоступен/заблокирован (UI — подпись
 *  кнопки и диалог перехода; коды — i18n ui.tasks.gate.*). */
export const transitionBlockReasonSchema = z.object({
  kind: z.enum([
    'no_open_subtasks',
    'checklist_complete',
    'fields_required',
    'time_logged',
    'result_present',
  ]),
  /** Для fields_required — какие поля не заполнены. */
  fields: z.array(taskRequirableFieldSchema).optional(),
  /** Для no_open_subtasks — сколько открытых подзадач. */
  count: z.number().int().min(0).optional(),
});
export type TransitionBlockReason = z.infer<typeof transitionBlockReasonSchema>;

/** Доступный текущему пользователю переход задачи (кнопка маршрута).
 *  Переходы, чьи условия «кто» не пройдены, в выдачу не попадают; гейты —
 *  попадают с `blockedBy` (кнопка видна, объясняет причину). Порядок задаёт
 *  сервер: кнопки статуса по `sortOrder`, затем «из любого» (#378). */
export const taskTransitionSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  toStageId: z.uuid(),
  toStageName: z.string().min(1),
  /** Системное состояние цели (иконка кнопки: закрыть / вернуть / вперёд). */
  toStageState: z.enum(['backlog', 'active', 'paused', 'done', 'closed']),
  /** Итог целевой стадии (null — не «Итог»): «✓ Завершена» / «✕ Отменена». */
  toStageOutcome: stageOutcomeSchema.nullable(),
  /** Показ в панели процесса: главная / видна / в меню «Ещё» (#378). */
  display: transitionDisplaySchema,
  blockedBy: z.array(transitionBlockReasonSchema),
  /** Можно ли пройти гейт с причиной (право task.override_gate). */
  canOverride: z.boolean(),
});
export type TaskTransition = z.infer<typeof taskTransitionSchema>;

/** Выполнение перехода. reason — обязательна при обходе гейта (аудит). */
export const executeTransitionBodySchema = z.object({
  override: z.boolean().optional(),
  reason: z.string().trim().min(1).max(500).optional(),
});
export type ExecuteTransitionBody = z.infer<typeof executeTransitionBodySchema>;
