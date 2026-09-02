import { z } from 'zod';

import { letterListItemSchema } from '../correspondence/letter.schemas.js';
import { userRefSchema } from '../directory/user-ref.schema.js';
import { taskListItemSchema } from '../tasks/task.schemas.js';

/** Агрегат главной страницы (рабочий кабинет вместо социальной ленты). */

export const feedPostSchema = z.object({
  id: z.uuid(),
  author: userRefSchema,
  text: z.string().min(1),
  likesCount: z.number().int().min(0),
  commentsCount: z.number().int().min(0),
  createdAt: z.iso.datetime(),
});

export type FeedPost = z.infer<typeof feedPostSchema>;

export const birthdayEntrySchema = z.object({
  user: userRefSchema,
  birthDate: z.iso.date(),
  isToday: z.boolean(),
});

export type BirthdayEntry = z.infer<typeof birthdayEntrySchema>;

export const homeSummarySchema = z.object({
  tasks: z.object({
    overdue: z.array(taskListItemSchema),
    today: z.array(taskListItemSchema),
    weekCount: z.number().int().min(0),
  }),
  letters: z.object({
    unregisteredCount: z.number().int().min(0),
    recent: z.array(letterListItemSchema),
  }),
  birthdays: z.array(birthdayEntrySchema),
  feed: z.array(feedPostSchema),
});

export type HomeSummary = z.infer<typeof homeSummarySchema>;
