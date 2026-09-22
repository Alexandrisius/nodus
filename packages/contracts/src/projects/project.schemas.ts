import { z } from 'zod';

import { counterpartyRefSchema } from '../counterparties/counterparty.schemas.js';
import { userRefSchema } from '../directory/user-ref.schema.js';
import { cursorQuerySchema } from '../pagination/paginated.schema.js';

/** Контракты модуля проектов (projects.Project). */

export const projectPrivacySchema = z.enum(['open', 'closed']);
export type ProjectPrivacy = z.infer<typeof projectPrivacySchema>;

export const projectRoleSchema = z.enum(['manager', 'member']);
export type ProjectRole = z.infer<typeof projectRoleSchema>;

/** Цвет-идентичность проекта (маркер-плитка в журналах и ссылках). Ключи,
 *  не hex (I15): тон разрешается в categorical-токены --chart-* своей темы. */
export const projectColorSchema = z.enum(['blue', 'green', 'amber', 'pink', 'sky', 'terra']);
export type ProjectColor = z.infer<typeof projectColorSchema>;

export const projectListItemSchema = z.object({
  id: z.uuid(),
  code: z.string().min(1),
  name: z.string().min(1),
  color: projectColorSchema,
  manager: userRefSchema.nullable(),
  myRole: projectRoleSchema,
  privacy: projectPrivacySchema,
  membersCount: z.number().int().min(0),
  membersPreview: z.array(userRefSchema),
  endDate: z.iso.date().nullable(),
  /** Заказчик проекта — контрагент из справочника (модель v2 корреспонденции,
   *  вердикт владельца 22.09.2026). */
  client: counterpartyRefSchema.nullable(),
  /** Последняя активность (для сортировки списка). */
  activityAt: z.iso.datetime(),
  /** Канал проекта в мессенджере, если создан. */
  channelId: z.uuid().nullable(),
});

export type ProjectListItem = z.infer<typeof projectListItemSchema>;

export const listProjectsQuerySchema = cursorQuerySchema.extend({
  scope: z.enum(['mine', 'all']).default('mine'),
  search: z.string().trim().min(1).max(128).optional(),
  /** Проекты сотрудника (вкладка «Проекты» карточки сотрудника): руководит
   *  или участник. */
  memberId: z.uuid().optional(),
});

export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
