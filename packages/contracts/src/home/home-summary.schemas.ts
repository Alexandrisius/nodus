import { z } from 'zod';

import { userRefSchema } from '../directory/user-ref.schema.js';

/** Агрегат главной страницы (#100): корпоративная витрина компании вокруг
 *  ленты уведомлений. Источники — только реальные данные; где модуля ещё
 *  нет (проекты, узлы данных, трекинг времени) — честные нули/пустые
 *  массивы, клиент такие блоки не рендерит (вердикт владельца 01.10). */

export const birthdayEntrySchema = z.object({
  user: userRefSchema,
  birthDate: z.iso.date(),
  isToday: z.boolean(),
});
export type BirthdayEntry = z.infer<typeof birthdayEntrySchema>;

export const companyStatsSchema = z.object({
  employeeCount: z.number().int().min(0),
  /** Модуль проектов в бэке ещё не жив — честный 0 до его появления. */
  projectsDone: z.number().int().min(0),
  /** Аналитика «узлов данных» — задел; источник появится с модулями. */
  dataNodes: z.number().int().min(0),
});
export type CompanyStats = z.infer<typeof companyStatsSchema>;

export const laborWeekSchema = z.object({
  label: z.string().min(1),
  hours: z.number().min(0),
});
export type LaborWeek = z.infer<typeof laborWeekSchema>;

export const overtimeEntrySchema = z.object({
  user: userRefSchema,
  hours: z.number().min(0),
});
export type OvertimeEntry = z.infer<typeof overtimeEntrySchema>;

export const homeSummarySchema = z.object({
  birthdays: z.array(birthdayEntrySchema),
  stats: companyStatsSchema,
  labor: z.object({
    weeks: z.array(laborWeekSchema),
    topOvertime: z.array(overtimeEntrySchema),
  }),
});
export type HomeSummary = z.infer<typeof homeSummarySchema>;
