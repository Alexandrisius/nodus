import { z } from 'zod';

/**
 * Каталог доменных событий модуля tasks (I9; каталог api-conventions.md,
 * только расширяется). Payload минимальный и клиентски видим (gateway
 * рассылает те же события). `audience` — пользователи, которым событие
 * доставляется в user-комнаты (постановщик, ответственный, соисполнители,
 * наблюдатели; при снятии участника — включая снятого, чтобы его клиент
 * убрал задачу); поле служебное — gateway вырезает его до отправки клиенту
 * (#328). Клиент применяет событие как сигнал к инвалидации кэша.
 */
export const TASK_EVENTS = {
  CREATED: 'task.created',
  UPDATED: 'task.updated',
  STAGE_CHANGED: 'task.stage_changed',
  STATUS_CHANGED: 'task.status_changed',
  PERSONAL_STAGE_CHANGED: 'task.personal_stage_changed',
  ASSIGNED: 'task.assigned',
  PARTICIPANTS_CHANGED: 'task.participants_changed',
  CHECKLIST_CHANGED: 'task.checklist_changed',
  COMPLETED: 'task.completed',
  OVERDUE: 'task.overdue',
  TIME_LOGGED: 'task.time_logged',
  TIMER_STARTED: 'task.timer_started',
  TIMER_STOPPED: 'task.timer_stopped',
  RESULT_SET: 'task.result_set',
  RELATION_CHANGED: 'task.relation_changed',
  DELETED: 'task.deleted',
  PERSONAL_STAGE_CREATED: 'task.personal_stage_created',
  PERSONAL_STAGE_UPDATED: 'task.personal_stage_updated',
  PERSONAL_STAGE_ARCHIVED: 'task.personal_stage_archived',
  /** Пересчитан счётчик комментариев (сообщений беседы задачи, #252):
   *  клиент ставит точное значение без рефеча досок. */
  COMMENTS_COUNTED: 'task.comments_counted',
  /** Каталожные события библиотеки типов (#378): без `audience` — gateway
   *  рассылает всем авторизованным сокетам (паттерн корпоративных
   *  стикерпаков); клиенты инвалидируют типы и маршруты. */
  TYPE_CREATED: 'task.type_created',
  TYPE_UPDATED: 'task.type_updated',
  TYPE_ARCHIVED: 'task.type_archived',
  WORKFLOW_PUBLISHED: 'task.workflow_published',
  /** Задачное: смена типа у задачи (audience — участники, #378). */
  TYPE_CHANGED: 'task.type_changed',
} as const;

export type TaskEventType = (typeof TASK_EVENTS)[keyof typeof TASK_EVENTS];

/** Общая часть payload событий задачи. */
export const taskEventBaseSchema = z.object({
  taskId: z.uuid(),
  number: z.number().int().min(1),
  audience: z.array(z.uuid()),
});
export type TaskEventBase = z.infer<typeof taskEventBaseSchema>;

export const taskCreatedPayloadSchema = taskEventBaseSchema.extend({
  title: z.string(),
  creatorId: z.uuid(),
  assigneeId: z.uuid(),
  coexecutorIds: z.array(z.uuid()),
  observerIds: z.array(z.uuid()),
  projectId: z.uuid().nullable(),
  parentId: z.uuid().nullable(),
  source: z.enum(['manual', 'chat_message', 'letter']),
  sourceId: z.uuid().nullable(),
});
export type TaskCreatedPayload = z.infer<typeof taskCreatedPayloadSchema>;

/** Правка полей: список изменённых ключей (значения — дочитываются API). */
export const taskUpdatedPayloadSchema = taskEventBaseSchema.extend({
  fields: z.array(z.string()),
  title: z.string().optional(),
  deadline: z.iso.datetime().nullable().optional(),
});
export type TaskUpdatedPayload = z.infer<typeof taskUpdatedPayloadSchema>;

export const taskStageChangedPayloadSchema = taskEventBaseSchema.extend({
  fromStageId: z.uuid(),
  toStageId: z.uuid(),
  toStageName: z.string(),
  fromState: z.string(),
  toState: z.string(),
  /** Итог целевой стадии, если она в этапе «Итог» (#378; optional — старые
   *  события журнала не несут поля). */
  toStageOutcome: z.enum(['success', 'cancelled']).nullable().optional(),
  /** Почему сменилась стадия: кнопка маршрута / перенос публикации /
   *  смена типа (#378, ADR-0021). */
  cause: z.enum(['transition', 'workflow_migration', 'type_change']).optional(),
  transitionId: z.uuid().nullable(),
  /** Гейт пройден обходом с причиной (task.override_gate). */
  overriddenGates: z.array(z.string()).optional(),
  /** Текст причины обхода гейта («Выполнить всё равно») — история и аудит
   *  (ADR-0020); есть только вместе с overriddenGates. */
  reason: z.string().max(500).optional(),
  creatorId: z.uuid(),
  assigneeId: z.uuid(),
  /** Соисполнители — адресаты «задача отменена» (наблюдатели — без звука). */
  coexecutorIds: z.array(z.uuid()).optional(),
});
export type TaskStageChangedPayload = z.infer<typeof taskStageChangedPayloadSchema>;

export const taskAssignedPayloadSchema = taskEventBaseSchema.extend({
  title: z.string(),
  assigneeId: z.uuid(),
  previousAssigneeId: z.uuid().nullable(),
});
export type TaskAssignedPayload = z.infer<typeof taskAssignedPayloadSchema>;

export const taskParticipantsChangedPayloadSchema = taskEventBaseSchema.extend({
  title: z.string(),
  added: z.array(z.object({ userId: z.uuid(), role: z.enum(['coexecutor', 'observer']) })),
  removed: z.array(z.uuid()),
});
export type TaskParticipantsChangedPayload = z.infer<typeof taskParticipantsChangedPayloadSchema>;

export const taskOverduePayloadSchema = taskEventBaseSchema.extend({
  title: z.string(),
  deadline: z.iso.datetime(),
  creatorId: z.uuid(),
  assigneeId: z.uuid(),
});
export type TaskOverduePayload = z.infer<typeof taskOverduePayloadSchema>;

export const taskTimeLoggedPayloadSchema = taskEventBaseSchema.extend({
  entryId: z.uuid(),
  userId: z.uuid(),
  minutes: z.number().int(),
  spentMinutes: z.number().int(),
});
export type TaskTimeLoggedPayload = z.infer<typeof taskTimeLoggedPayloadSchema>;

/** Личный маршрут «Мой план»: событие только владельцу (audience = [owner]). */
export const taskPersonalStageEventPayloadSchema = z.object({
  stageId: z.uuid(),
  audience: z.array(z.uuid()),
});
export type TaskPersonalStageEventPayload = z.infer<typeof taskPersonalStageEventPayloadSchema>;

/** Счётчик комментариев задачи (#252): точное значение после пересчёта. */
export const taskCommentsCountedPayloadSchema = taskEventBaseSchema.extend({
  commentsCount: z.number().int().min(0),
});
export type TaskCommentsCountedPayload = z.infer<typeof taskCommentsCountedPayloadSchema>;

/** Каталожные события библиотеки типов (#378): без `audience` — gateway
 *  доставляет всем авторизованным (рассылка всем), клиенты инвалидируют
 *  каталоги. Payload минимальный: подробности — GET /tasks/types, /tasks/workflows/:id. */
export const taskTypeCreatedPayloadSchema = z.object({
  typeId: z.uuid(),
  name: z.string(),
});
export type TaskTypeCreatedPayload = z.infer<typeof taskTypeCreatedPayloadSchema>;

export const taskTypeUpdatedPayloadSchema = z.object({
  typeId: z.uuid(),
  /** Изменённые ключи свойств типа. */
  fields: z.array(z.string()),
});
export type TaskTypeUpdatedPayload = z.infer<typeof taskTypeUpdatedPayloadSchema>;

export const taskTypeArchivedPayloadSchema = z.object({
  typeId: z.uuid(),
});
export type TaskTypeArchivedPayload = z.infer<typeof taskTypeArchivedPayloadSchema>;

export const taskWorkflowPublishedPayloadSchema = z.object({
  workflowId: z.uuid(),
  /** Типы, идущие по маршруту. */
  typeIds: z.array(z.uuid()),
  version: z.number().int().min(1),
  /** Переносы задач из архивированных статусов (≤ 20) — вход фонового
   *  задания: его ставит outbox-обработчик события (доставка at-least-once). */
  moves: z.array(z.object({ fromStageId: z.uuid(), toStageId: z.uuid() })),
  /** Статусы со сменой группы (задачи пересчитываются фоном). */
  restates: z.array(z.object({ stageId: z.uuid(), systemState: z.string() })),
});
export type TaskWorkflowPublishedPayload = z.infer<typeof taskWorkflowPublishedPayloadSchema>;

/** Смена типа задачи (#378): задачное событие с обычной аудиторией; стадия
 *  меняется только если прежней нет в новом маршруте. */
export const taskTypeChangedPayloadSchema = taskEventBaseSchema.extend({
  title: z.string(),
  typeId: z.uuid(),
  typeName: z.string(),
  fromTypeId: z.uuid(),
  workflowId: z.uuid(),
  stageId: z.uuid(),
  stageName: z.string(),
});
export type TaskTypeChangedPayload = z.infer<typeof taskTypeChangedPayloadSchema>;
