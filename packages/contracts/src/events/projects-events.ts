import { z } from 'zod';

import { projectStatusSchema, projectVisibilitySchema } from '../projects/project.schemas.js';

/**
 * Каталог доменных событий модуля projects (#52, I9; каталог
 * api-conventions.md, только расширяется). Payload минимальный и клиентски
 * видим; значения для межмодульных обработчиков (crm не читает чужие
 * таблицы, I3) несёт payload: заказчик — с предыдущим значением.
 */
export const PROJECT_EVENTS = {
  CREATED: 'project.created',
  UPDATED: 'project.updated',
  PARTICIPANTS_CHANGED: 'project.participants_changed',
} as const;

export type ProjectEventType = (typeof PROJECT_EVENTS)[keyof typeof PROJECT_EVENTS];

export const projectCreatedPayloadSchema = z.object({
  projectId: z.uuid(),
  name: z.string(),
  /** null — «тема» без шифра. */
  code: z.string().nullable(),
  managerId: z.uuid(),
  assistantIds: z.array(z.uuid()),
  /** Заказчик — контрагент (#460); проекция crm слушает. */
  clientId: z.uuid().nullable(),
  visibility: projectVisibilitySchema,
  typeId: z.uuid(),
});
export type ProjectCreatedPayload = z.infer<typeof projectCreatedPayloadSchema>;

/** Правка полей: список изменённых ключей + значения для обработчиков.
 *  `name` — канал проекта переименовывается («Проект: <имя>»); `status` —
 *  новое значение при статусном действии (лента «История»). */
export const projectUpdatedPayloadSchema = z.object({
  projectId: z.uuid(),
  fields: z.array(z.string()),
  name: z.string().optional(),
  status: projectStatusSchema.optional(),
  clientId: z.uuid().nullable().optional(),
  /** Прежний заказчик — crm убирает строку использования при смене/снятии. */
  previousClientId: z.uuid().nullable().optional(),
});
export type ProjectUpdatedPayload = z.infer<typeof projectUpdatedPayloadSchema>;

/** Состав участников проекта изменился (любой источник): канал проекта
 *  пересобирает roster (Р8), вкладка «Участники» перечитывается. */
export const projectParticipantsChangedPayloadSchema = z.object({
  projectId: z.uuid(),
  changedUserIds: z.array(z.uuid()),
});
export type ProjectParticipantsChangedPayload = z.infer<
  typeof projectParticipantsChangedPayloadSchema
>;
