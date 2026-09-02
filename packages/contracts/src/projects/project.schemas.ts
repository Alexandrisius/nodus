import { z } from 'zod';

import { userRefSchema } from '../directory/user-ref.schema.js';
import { cursorQuerySchema } from '../pagination/paginated.schema.js';

/** Контракты модуля проектов (projects.Project). */

export const projectPrivacySchema = z.enum(['open', 'closed']);
export type ProjectPrivacy = z.infer<typeof projectPrivacySchema>;

export const projectRoleSchema = z.enum(['manager', 'member']);
export type ProjectRole = z.infer<typeof projectRoleSchema>;

export const projectListItemSchema = z.object({
  id: z.uuid(),
  code: z.string().min(1),
  name: z.string().min(1),
  /** Стадия проекта (справочник, I15) — денормализованное название. */
  stageName: z.string().nullable(),
  manager: userRefSchema.nullable(),
  myRole: projectRoleSchema,
  privacy: projectPrivacySchema,
  membersCount: z.number().int().min(0),
  membersPreview: z.array(userRefSchema),
  endDate: z.iso.date().nullable(),
  /** Последняя активность (для сортировки списка). */
  activityAt: z.iso.datetime(),
});

export type ProjectListItem = z.infer<typeof projectListItemSchema>;

export const listProjectsQuerySchema = cursorQuerySchema.extend({
  scope: z.enum(['mine', 'all']).default('mine'),
  search: z.string().trim().min(1).max(128).optional(),
});

export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
