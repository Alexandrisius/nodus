import { z } from 'zod';

import { userRefSchema } from '../directory/user-ref.schema.js';
import { projectRefSchema } from '../tasks/task.schemas.js';
import { cursorQuerySchema } from '../pagination/paginated.schema.js';

/**
 * Контракты модуля корреспонденции (correspondence.Letter).
 * Центральный сценарий: письмо → резолюция → поручение (поток А).
 */

export const letterTypeSchema = z.enum(['incoming', 'outgoing']);
export type LetterType = z.infer<typeof letterTypeSchema>;

export const letterStatusSchema = z.enum(['unregistered', 'in_work', 'done', 'overdue']);
export type LetterStatus = z.infer<typeof letterStatusSchema>;

export const letterAttachmentSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  size: z.number().int().min(0),
  mime: z.string().min(1),
});

export type LetterAttachment = z.infer<typeof letterAttachmentSchema>;

/** Резолюция руководителя; порождает поручение (task с source=letter). */
export const resolutionSchema = z.object({
  id: z.uuid(),
  text: z.string().min(1),
  author: userRefSchema,
  taskId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
});

export type Resolution = z.infer<typeof resolutionSchema>;

export const letterListItemSchema = z.object({
  id: z.uuid(),
  type: letterTypeSchema,
  /** Рег. номер присваивается при регистрации; до того письмо в очереди. */
  regNumber: z.string().nullable(),
  regDate: z.iso.date().nullable(),
  /** Отправитель (входящее) или получатель (исходящее). */
  correspondent: z.string().min(1),
  subject: z.string().min(1),
  status: letterStatusSchema,
  project: projectRefSchema.nullable(),
  deadline: z.iso.date().nullable(),
  receivedAt: z.iso.datetime(),
});

export type LetterListItem = z.infer<typeof letterListItemSchema>;

export const letterDetailSchema = letterListItemSchema.extend({
  body: z.string(),
  attachments: z.array(letterAttachmentSchema),
  resolutions: z.array(resolutionSchema),
});

export type LetterDetail = z.infer<typeof letterDetailSchema>;

export const listLettersQuerySchema = cursorQuerySchema.extend({
  folder: z.enum(['unregistered', 'incoming', 'outgoing']).default('incoming'),
  search: z.string().trim().min(1).max(128).optional(),
});

export type ListLettersQuery = z.infer<typeof listLettersQuerySchema>;
