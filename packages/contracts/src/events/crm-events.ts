import { z } from 'zod';

/**
 * Каталог доменных событий модуля crm (I9; каталог api-conventions.md, только
 * расширяется). Payload минимальный: id и ключевые поля, персональных данных
 * контактных лиц в payload нет — подписчик дочитывает карточку через API.
 * События без `audience` (gateway отбрасывает неизвестные события без
 * беседы); счётчики писем/проектов наполнят обработчики #55/#52.
 */
export const CRM_EVENTS = {
  COUNTERPARTY_CREATED: 'crm.counterparty_created',
  COUNTERPARTY_UPDATED: 'crm.counterparty_updated',
  COUNTERPARTY_ARCHIVED: 'crm.counterparty_archived',
  COUNTERPARTY_RESTORED: 'crm.counterparty_restored',
  /** Физическое удаление записи без связей (у связанных — только архив). */
  COUNTERPARTY_DELETED: 'crm.counterparty_deleted',
  CONTACT_CHANGED: 'crm.contact_changed',
} as const;

export type CrmEventType = (typeof CRM_EVENTS)[keyof typeof CRM_EVENTS];

export const counterpartyCreatedPayloadSchema = z.object({
  counterpartyId: z.uuid(),
  shortName: z.string().min(1),
  unp: z.string().nullable(),
});
export type CounterpartyCreatedPayload = z.infer<typeof counterpartyCreatedPayloadSchema>;

export const counterpartyUpdatedPayloadSchema = z.object({
  counterpartyId: z.uuid(),
  /** Изменённые поля карточки (имена DTO). */
  fields: z.array(z.string()),
});
export type CounterpartyUpdatedPayload = z.infer<typeof counterpartyUpdatedPayloadSchema>;

export const counterpartyArchivedPayloadSchema = z.object({
  counterpartyId: z.uuid(),
});
export type CounterpartyArchivedPayload = z.infer<typeof counterpartyArchivedPayloadSchema>;

export const contactChangedPayloadSchema = z.object({
  counterpartyId: z.uuid(),
  contactId: z.uuid(),
  change: z.enum(['added', 'updated', 'archived', 'restored', 'deleted']),
  /** Для `updated` — изменённые поля контактного лица. */
  fields: z.array(z.string()).optional(),
});
export type ContactChangedPayload = z.infer<typeof contactChangedPayloadSchema>;
