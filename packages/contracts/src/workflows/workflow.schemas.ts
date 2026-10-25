import { z } from 'zod';

import { Permission } from '../auth/permission.js';
import { transitionFormInputSchema, transitionFormSchema } from './transition-form.schemas.js';
import {
  docIdSchema,
  stageColorSchema,
  stageOutcomeSchema,
  taskSystemStateSchema,
  transitionDisplaySchema,
} from './workflow-primitives.schemas.js';

/**
 * Движок маршрутов «Процессов» (ADR-0020/ADR-0024): глобальный тип → маршрут
 * (стадии + переходы с правилами) через схему «тип → маршрут». Реестр видов
 * правил ЗАКРЫТ: новый вид = расширение union + обработчик в сервисе; сервер
 * отвергает неизвестный вид при чтении (правило в данных без исполнителя в
 * коде — ложная безопасность). Типы процессов — `process-type.schemas.ts`;
 * документ редактора — `workflow-document.schemas.ts`.
 */

const PERMISSION_VALUES = Object.values(Permission) as [Permission, ...Permission[]];

/** Роль пользователя относительно сущности процесса (вход условий переходов
 *  и прав). Словарь ролей задаёт адаптер категории (ADR-0024): у задачи —
 *  постановщик/ответственный/соисполнитель/наблюдатель, у письма — свой
 *  (добавит #55); движок ролей не знает, сравнивает с условиями маршрута. */
export const workflowActorRoleSchema = z.enum(['creator', 'assignee', 'coexecutor', 'observer']);
export type WorkflowActorRole = z.infer<typeof workflowActorRoleSchema>;

/** Поля сущности, которые могут требовать гейты `fields_required` (DoR/DoD).
 *  Реестр полей — словарь категории: адаптер отдаёт заполненность по имени. */
export const workflowRequirableFieldSchema = z.enum([
  'description',
  'deadline',
  'assignee',
  'plannedMinutes',
  'result',
]);
export type WorkflowRequirableField = z.infer<typeof workflowRequirableFieldSchema>;

/** Условия — КТО видит и может нажать кнопку перехода. Пустой список —
 *  любой, кто может править сущность. Несколько условий — ИЛИ. */
export const workflowConditionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('role_in'), roles: z.array(workflowActorRoleSchema).min(1) }),
  // Только право из каталога (`auth/permission.ts`): опечатка или выдуманное
  // право сделало бы кнопку невидимой всем (security-ревью #378).
  z.object({ kind: z.literal('permission'), permission: z.enum(PERMISSION_VALUES) }),
]);
export type WorkflowCondition = z.infer<typeof workflowConditionSchema>;

/** Валидаторы — гейты DoR/DoD: все должны пройти (И). */
export const workflowValidatorSchema = z.discriminatedUnion('kind', [
  /** Нет незавершённых подзадач. Строго (по умолчанию) мешают подзадачи и
   *  в работе, и на утверждении; `allowReview` — подзадачи на утверждении
   *  не мешают (ADR-0020, дополнение 2). Нет ключа = строго (редактор
   *  пишет только `true`). */
  z.object({ kind: z.literal('no_open_subtasks'), allowReview: z.boolean().optional() }),
  z.object({ kind: z.literal('checklist_complete') }),
  z.object({
    kind: z.literal('fields_required'),
    fields: z.array(workflowRequirableFieldSchema).min(1),
  }),
  z.object({ kind: z.literal('time_logged') }),
  z.object({ kind: z.literal('result_present') }),
  /** Приложены файлы итога (#380): у текущей ревизии итога не меньше `min`
   *  живых вложений (kind image|file; стикеры не считаются). */
  z.object({ kind: z.literal('result_files'), min: z.number().int().min(1).max(5) }),
]);
export type WorkflowValidator = z.infer<typeof workflowValidatorSchema>;
export type WorkflowValidatorKind = WorkflowValidator['kind'];

/** Пост-действия — что сделать после перехода (в той же транзакции).
 *  Встроенное (не правило): completedAt ставится входом в «Итог» (closed)
 *  и снимается выходом из него — «Утверждение» (done) не завершение;
 *  личные доски участников переезжают по состоянию. */
export const workflowPostFunctionSchema = z.discriminatedUnion('kind', [
  /** УСТАРЕВШИЙ (#378): ветвление по флагу задачи «принять после завершения»
   *  (accept_required уходит, ADR-0020 дополнение); остаётся только в
   *  архивных переходах истории — новые маршруты его не несут. */
  z.object({ kind: z.literal('route_if_accept_required'), stageCode: z.string().min(1) }),
  /** Если условие выполнено, цель подменяется стадией `toStageId` —
   *  утверждение пропускается, когда постановщик сам себе исполнитель (#378).
   *  docId: в черновике цель может быть новой стадией `new:*` (разрешается
   *  в uuid при публикации); uuid-only рвал rehydrate черновика. */
  z.object({
    kind: z.literal('route_if'),
    when: z.literal('creator_is_assignee'),
    toStageId: docIdSchema,
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
    'result_files',
  ]),
  /** Для fields_required — какие поля не заполнены. */
  fields: z.array(workflowRequirableFieldSchema).optional(),
  /** Для no_open_subtasks — сколько подзадач мешают (в строгом режиме
   *  вместе с подзадачами на утверждении). */
  count: z.number().int().min(0).optional(),
  /** Для result_files — сколько файлов итога есть (нужно `min`). */
  min: z.number().int().min(1).max(5).optional(),
});
export type TransitionBlockReason = z.infer<typeof transitionBlockReasonSchema>;

/** Доступный текущему пользователю переход сущности (кнопка маршрута).
 *  Переходы, чьи условия «кто» не пройдены, в выдачу не попадают; гейты —
 *  попадают с `blockedBy` (кнопка видна, объясняет причину). Порядок задаёт
 *  сервер: кнопки статуса по `sortOrder`, затем «из любого» (#378). */
export const workflowTransitionSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  toStageId: z.uuid(),
  toStageName: z.string().min(1),
  /** Системное состояние цели (иконка кнопки: закрыть / вернуть / вперёд). */
  toStageState: taskSystemStateSchema,
  /** Итог целевой стадии (null — не «Итог»): «✓ Завершена» / «✕ Отменена». */
  toStageOutcome: stageOutcomeSchema.nullable(),
  /** Цвет и порядок цели — клиент строит оптимистичную стадию без каталога. */
  toStageColor: stageColorSchema,
  toStageOrder: z.number().int().min(0),
  /** Показ в панели процесса: главная / видна / в меню «Ещё» (#378). */
  display: transitionDisplaySchema,
  blockedBy: z.array(transitionBlockReasonSchema),
  /** Можно ли пройти гейт с причиной (право task.override_gate). */
  canOverride: z.boolean(),
  /** Окно при нажатии (#380): null — окно выключено. Эффективные разделы
   *  (настройка ∪ гейты) собирает `effectiveWindowSections`. */
  form: transitionFormSchema.nullable(),
  /** Гейты кнопки — для живого списка условий в окне. */
  validators: z.array(workflowValidatorSchema),
});
export type WorkflowTransition = z.infer<typeof workflowTransitionSchema>;

/** Выполнение перехода. reason — обязательна при обходе гейта (аудит).
 *  form — введённое в окне; сервер сверяет состав с эффективным окном
 *  (лишнее/пропущенное обязательное → 422 TASK_TRANSITION_FORM_INVALID). */
export const executeTransitionBodySchema = z
  .object({
    override: z.boolean().optional(),
    reason: z.string().trim().min(1).max(500).optional(),
    form: transitionFormInputSchema.optional(),
  })
  .strict();
export type ExecuteTransitionBody = z.infer<typeof executeTransitionBodySchema>;
