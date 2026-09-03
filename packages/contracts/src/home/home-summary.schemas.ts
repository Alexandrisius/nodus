import { z } from 'zod';

import { letterListItemSchema } from '../correspondence/letter.schemas.js';
import { userRefSchema } from '../directory/user-ref.schema.js';
import { taskListItemSchema } from '../tasks/task.schemas.js';

/** Агрегат главной страницы: корпоративная витрина компании + рабочий кабинет. */

export const birthdayEntrySchema = z.object({
  user: userRefSchema,
  birthDate: z.iso.date(),
  isToday: z.boolean(),
});

export type BirthdayEntry = z.infer<typeof birthdayEntrySchema>;

export const companyStatsSchema = z.object({
  employeeCount: z.number().int().min(0),
  projectsDone: z.number().int().min(0),
  revenueByn: z.number().min(0),
  dataNodes: z.number().int().min(0),
});

export type CompanyStats = z.infer<typeof companyStatsSchema>;

export const companyNewsItemSchema = z.object({
  id: z.uuid(),
  author: userRefSchema,
  title: z.string().min(1),
  text: z.string().min(1),
  publishedAt: z.iso.datetime(),
  likesCount: z.number().int().min(0),
  commentsCount: z.number().int().min(0),
});

export type CompanyNewsItem = z.infer<typeof companyNewsItemSchema>;

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
  stats: companyStatsSchema,
  news: z.array(companyNewsItemSchema),
});

export type HomeSummary = z.infer<typeof homeSummarySchema>;
