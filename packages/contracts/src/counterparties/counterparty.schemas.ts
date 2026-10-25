import { z } from 'zod';

import { emailInputSchema } from '../auth/auth.schemas.js';
import { cursorQuerySchema } from '../pagination/paginated.schema.js';

/**
 * Контракты домена master-данных модуля `crm` (ADR-0033, вердикт владельца
 * #83): контрагенты и контактные лица. Внешние организации: заказчики,
 * подрядчики, поставщики, госорганы. Лиды/сделки/воронки не моделируются;
 * корреспондент письма и заказчик проекта — ссылка по id (counterpartyRef),
 * не свободный текст (I14, I15). Удаления нет — архивация.
 */

/** Денормализованная ссылка на контрагента в чужих DTO (образец: userRef).
 *  `name` — краткое название (витринное), полное — в карточке. */
export const counterpartyRefSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
});

export type CounterpartyRef = z.infer<typeof counterpartyRefSchema>;

/**
 * Нормализация УНП (учётный номер плательщика Республики Беларусь):
 * «100 123 456», «УНП 100123456», «100-123-456» → `100123456`. Одна
 * грамматика для фронта и бэка (уникальность сравнивает нормализованное
 * значение). Жёстких «9 цифр» нет: иностранные контрагенты и госорганы
 * нумеруются иначе. Чистая функция — unit-тест в contracts (ADR-0021).
 */
export function normalizeUnp(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/^УНП/u, '')
    .replace(/[\s.:\-–—]/gu, '');
}

/** УНП на входе: нормализуется и проверяется форма (1–32 буквы/цифры). */
export const unpInputSchema = z
  .string()
  .overwrite(normalizeUnp)
  .regex(/^[0-9A-ZА-ЯЁ]{1,32}$/u, { message: 'УНП: только буквы и цифры, до 32 знаков' });

/** Контактное лицо контрагента (внутренняя запись справочника). */
export const contactPersonSchema = z.object({
  id: z.uuid(),
  fullName: z.string().min(1),
  position: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  /** Архивная запись: в карточке показывается свёрнутой, выбрать нельзя. */
  archivedAt: z.iso.datetime().nullable(),
});

export type ContactPerson = z.infer<typeof contactPersonSchema>;

export const counterpartyListItemSchema = z.object({
  id: z.uuid(),
  fullName: z.string().min(1),
  /** Краткое (витринное) название — используется в ref-ссылках и списках. */
  shortName: z.string().min(1),
  /** Учётный номер плательщика; у госорганов может не быть. */
  unp: z.string().nullable(),
  address: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  /** Денормализованные счётчики связей для колонок реестра (I14: данные — актив). */
  lettersCount: z.number().int().min(0),
  projectsCount: z.number().int().min(0),
  contactsCount: z.number().int().min(0),
  archivedAt: z.iso.datetime().nullable(),
});

export type CounterpartyListItem = z.infer<typeof counterpartyListItemSchema>;

export const counterpartyCardSchema = z.object({
  id: z.uuid(),
  fullName: z.string().min(1),
  shortName: z.string().min(1),
  unp: z.string().nullable(),
  address: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  /** Кастомные поля области `counterparty` (ADR-0029); запись — с #431. */
  customFields: z.record(z.string(), z.unknown()),
  lettersCount: z.number().int().min(0),
  projectsCount: z.number().int().min(0),
  /** Все контактные лица: действующие по ФИО, затем архивные. */
  contactPersons: z.array(contactPersonSchema),
  archivedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type CounterpartyCard = z.infer<typeof counterpartyCardSchema>;

export const listCounterpartiesQuerySchema = cursorQuerySchema.extend({
  /** Подстрока краткого/полного названия или УНП (без учёта регистра). */
  search: z.string().trim().min(1).max(128).optional(),
  includeArchived: z.stringbool().default(false),
});

export type ListCounterpartiesQuery = z.infer<typeof listCounterpartiesQuerySchema>;

/** Подсказка похожих при вводе (регистрация письма, создание контрагента):
 *  хотя бы одно из полей; ответ — не более 5 совпадений. */
export const similarCounterpartiesQuerySchema = z
  .object({
    name: z.string().trim().max(256).optional(),
    unp: unpInputSchema.optional(),
  })
  .refine((v) => Boolean(v.name || v.unp), { message: 'name or unp is required' });

export type SimilarCounterpartiesQuery = z.infer<typeof similarCounterpartiesQuerySchema>;

/** Совпадение подсказки: `matchedBy` — чем совпало (точный УНП важнее имени). */
export const counterpartyMatchSchema = z.object({
  id: z.uuid(),
  shortName: z.string().min(1),
  fullName: z.string().min(1),
  unp: z.string().nullable(),
  archivedAt: z.iso.datetime().nullable(),
  matchedBy: z.enum(['unp', 'name']),
});

export type CounterpartyMatch = z.infer<typeof counterpartyMatchSchema>;

/** Название организации на входе: trim + схлопывание внутренних пробелов. */
const organizationNameInput = (max: number) =>
  z
    .string()
    .overwrite((value: string) => value.trim().replace(/\s+/gu, ' '))
    .min(1)
    .max(max);

/** Необязательное поле ввода: `null` — очистить, отсутствие — не менять. */
const optionalLine = (max: number) => z.string().trim().min(1).max(max).nullable();

/** Создание контрагента (в т.ч. «на лету» из автокомплита регистрации письма).
 *  Реквизиты, кроме названий, необязательны: скрипты и ИИ-агенты могут
 *  слать только имена (I2). */
export const createCounterpartyBodySchema = z.object({
  fullName: organizationNameInput(256),
  shortName: organizationNameInput(128),
  unp: unpInputSchema.nullable().optional(),
  address: optionalLine(512).optional(),
  email: emailInputSchema.nullable().optional(),
  phone: optionalLine(32).optional(),
});

export type CreateCounterpartyBody = z.infer<typeof createCounterpartyBodySchema>;

export const updateCounterpartyBodySchema = createCounterpartyBodySchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'empty update' });

export type UpdateCounterpartyBody = z.infer<typeof updateCounterpartyBodySchema>;

export const addContactPersonBodySchema = z.object({
  fullName: organizationNameInput(256),
  position: optionalLine(128).optional(),
  phone: optionalLine(32).optional(),
  email: emailInputSchema.nullable().optional(),
});

export type AddContactPersonBody = z.infer<typeof addContactPersonBodySchema>;

export const updateContactPersonBodySchema = addContactPersonBodySchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'empty update' });

export type UpdateContactPersonBody = z.infer<typeof updateContactPersonBodySchema>;

/** Массовые операции над контрагентами (#460): архив и возврат пачкой.
 *  Каждая запись проверяется отдельно (права, существование) — частичный
 *  успех норма, ответ по записи (как у задач, `taskBulkResultSchema`). */
export const counterpartyBulkActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('archive') }),
  z.object({ kind: z.literal('restore') }),
]);

export type CounterpartyBulkAction = z.infer<typeof counterpartyBulkActionSchema>;

export const bulkCounterpartiesBodySchema = z.object({
  counterpartyIds: z.array(z.uuid()).min(1).max(100),
  action: counterpartyBulkActionSchema,
});

export type BulkCounterpartiesBody = z.infer<typeof bulkCounterpartiesBodySchema>;

export const counterpartyBulkResultSchema = z.object({
  results: z.array(
    z.object({
      counterpartyId: z.uuid(),
      ok: z.boolean(),
      /** Код ошибки (ErrorCode) при ok=false. */
      code: z.string().optional(),
    }),
  ),
});

export type CounterpartyBulkResult = z.infer<typeof counterpartyBulkResultSchema>;
