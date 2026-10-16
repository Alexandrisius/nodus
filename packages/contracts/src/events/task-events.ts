import { z } from 'zod';

/**
 * Каталог доменных событий модуля tasks (I9; каталог api-conventions.md,
 * только расширяется). Payload минимальный и клиентски видим (gateway
 * рассылает те же события). `audience` — пользователи, которым событие
 * доставляется в user-комнаты (постановщик, ответственный, соисполнители,
 * наблюдатели; при снятии участника — включая снятого, чтобы его клиент
 * убрал задачу). Клиент применяет событие как сигнал к инвалидации кэша.
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
  transitionId: z.uuid().nullable(),
  /** Гейт пройден обходом с причиной (task.override_gate). */
  overriddenGates: z.array(z.string()).optional(),
  creatorId: z.uuid(),
  assigneeId: z.uuid(),
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
