import { z } from 'zod';

import { userRefSchema } from '../directory/user-ref.schema.js';
import { taskRefSchema } from './task.schemas.js';

/**
 * Трудозатраты (I14): ручная запись и таймер. Пишут ответственный и
 * соисполнители; удаляет автор или task.manage_any. Идущий таймер — запись
 * method=timer с endedAt=null, у сотрудника не больше одного (старт нового
 * останавливает старый). spentMinutes задачи денормализуется в той же tx.
 */
export const timeEntryMethodSchema = z.enum(['manual', 'timer']);
export type TimeEntryMethod = z.infer<typeof timeEntryMethodSchema>;

/** Календарная дата работы, YYYY-MM-DD (день сотрудника, не момент). */
export const workDateSchema = z.iso.date();

export const timeEntrySchema = z.object({
  id: z.uuid(),
  taskId: z.uuid().nullable(),
  user: userRefSchema,
  minutes: z.number().int().min(0),
  date: workDateSchema,
  method: timeEntryMethodSchema,
  startedAt: z.iso.datetime().nullable(),
  endedAt: z.iso.datetime().nullable(),
  comment: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type TimeEntry = z.infer<typeof timeEntrySchema>;

export const timeEntryCreateBodySchema = z.object({
  /** До суток одной записью. */
  minutes: z.number().int().min(1).max(1440),
  date: workDateSchema,
  comment: z.string().trim().max(500).optional(),
});
export type TimeEntryCreateBody = z.infer<typeof timeEntryCreateBodySchema>;

/** Идущий таймер текущего пользователя (null — не идёт). */
export const runningTimerSchema = z.object({
  entryId: z.uuid(),
  task: taskRefSchema,
  startedAt: z.iso.datetime(),
});
export type RunningTimer = z.infer<typeof runningTimerSchema>;
