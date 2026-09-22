import { z } from 'zod';

import { cursorQuerySchema } from '../pagination/paginated.schema.js';

/**
 * Контракты справочника контрагентов (counterparties.Counterparty).
 * Внешние организации: заказчики, подрядчики, поставщики, госорганы.
 * Справочник-карточка, НЕ CRM (вердикт владельца 22.09.2026): лиды/сделки/
 * воронки не моделируются. Корреспондент письма — ссылка на контрагента
 * (counterpartyRef), не свободный текст (I15).
 */

/** Денормализованная ссылка на контрагента в чужих DTO (образец: userRef).
 *  `name` — краткое название (витринное), полное — в карточке. */
export const counterpartyRefSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
});

export type CounterpartyRef = z.infer<typeof counterpartyRefSchema>;

/** Контактное лицо контрагента (внутренняя запись справочника). */
export const contactPersonSchema = z.object({
  id: z.uuid(),
  fullName: z.string().min(1),
  position: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
});

export type ContactPerson = z.infer<typeof contactPersonSchema>;

export const counterpartyListItemSchema = z.object({
  id: z.uuid(),
  fullName: z.string().min(1),
  /** Краткое (витринное) название — используется в ref-ссылках и списках. */
  shortName: z.string().min(1),
  /** Учётный номер плательщика (Республика Беларусь); у госорганов может не быть. */
  unp: z.string().nullable(),
  /** Денормализованные счётчики связей для колонок реестра (I14: данные — актив). */
  lettersCount: z.number().int().min(0),
  projectsCount: z.number().int().min(0),
  contactsCount: z.number().int().min(0),
});

export type CounterpartyListItem = z.infer<typeof counterpartyListItemSchema>;

export const counterpartyCardSchema = z.object({
  id: z.uuid(),
  fullName: z.string().min(1),
  shortName: z.string().min(1),
  unp: z.string().nullable(),
  address: z.string().nullable(),
  contactPersons: z.array(contactPersonSchema),
});

export type CounterpartyCard = z.infer<typeof counterpartyCardSchema>;

export const listCounterpartiesQuerySchema = cursorQuerySchema.extend({
  search: z.string().trim().min(1).max(128).optional(),
});

export type ListCounterpartiesQuery = z.infer<typeof listCounterpartiesQuerySchema>;

/** Создание контрагента (в т.ч. «на лету» из автокомплита регистрации письма). */
export const createCounterpartyBodySchema = z.object({
  fullName: z.string().trim().min(1).max(256),
  shortName: z.string().trim().min(1).max(128),
  unp: z.string().trim().max(32).nullable(),
  address: z.string().trim().max(512).nullable(),
});

export type CreateCounterpartyBody = z.infer<typeof createCounterpartyBodySchema>;

export const addContactPersonBodySchema = z.object({
  fullName: z.string().trim().min(1).max(256),
  position: z.string().trim().max(128).nullable(),
  phone: z.string().trim().max(32).nullable(),
  email: z.string().trim().max(256).nullable(),
});

export type AddContactPersonBody = z.infer<typeof addContactPersonBodySchema>;
