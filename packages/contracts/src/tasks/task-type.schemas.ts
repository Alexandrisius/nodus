import { z } from 'zod';

import { stageColorSchema } from './workflow-primitives.schemas.js';

/**
 * Тип задачи (глобальный справочник, ADR-0020; библиотека типов и редактор
 * маршрутов — #378). Один тип — один маршрут через схему «тип → маршрут»;
 * нужен другой маршрут — новый тип копией (решение владельца 19.10).
 */

/** Значки типов — закрытый набор ключей lucide (реестр на вебе:
 *  `shared/workflow/task-type-icon.tsx`); новый значок = расширение набора. */
export const taskTypeIconSchema = z.enum([
  'square-check',
  'zap',
  'file-text',
  'pencil-ruler',
  'clipboard-check',
  'send',
  'search-check',
  'wrench',
  'calculator',
  'drafting-compass',
  'messages-square',
  'calendar-clock',
  'shield-check',
  'package',
  'flag',
  'star',
]);
export type TaskTypeIcon = z.infer<typeof taskTypeIconSchema>;

/** Тип задачи (глобальный справочник, I15). `creatable=false` — скрыт:
 *  не предлагается при создании задач (новые и настроенные типы). */
export const taskTypeSchema = z.object({
  id: z.uuid(),
  /** Служебный код; у типов из редактора генерирует сервер, в UI не показывается. */
  code: z.string().min(1),
  name: z.string().min(1),
  icon: taskTypeIconSchema,
  color: stageColorSchema,
  /** Описание для сотрудников (подсказка в выборе типа при создании). */
  description: z.string(),
  /** Доступен при создании задач. */
  creatable: z.boolean(),
  /** Узел дерева проекта (ступень 3): в «Мой план» исполнителей не попадает. */
  structural: z.boolean(),
  isSystem: z.boolean(),
  sortOrder: z.number().int().min(0),
  archivedAt: z.iso.datetime().nullable(),
  /** Маршрут типа (Workflow kind=task) — холст редактора. */
  workflowId: z.uuid(),
});
export type TaskType = z.infer<typeof taskTypeSchema>;

export const taskTypeRefSchema = taskTypeSchema.pick({ id: true, code: true, name: true });
export type TaskTypeRef = z.infer<typeof taskTypeRefSchema>;

/** `GET /tasks/types?archived=`: exclude (по умолчанию) — живые; include —
 *  с архивом (свёрнутая группа); only — только архив. */
export const taskTypeListQuerySchema = z.object({
  archived: z.enum(['include', 'only']).optional(),
});
export type TaskTypeListQuery = z.infer<typeof taskTypeListQuerySchema>;

/** Основа маршрута при создании типа: копия живого типа или простой
 *  Ожидает → В работе → Завершена. */
export const taskTypeBaseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('copy'), typeId: z.uuid() }),
  z.object({ kind: z.literal('simple') }),
]);
export type TaskTypeBase = z.infer<typeof taskTypeBaseSchema>;

/** `POST /tasks/types` — тип создаётся скрытым (`creatable=false`). */
export const createTaskTypeBodySchema = z.object({
  name: z.string().trim().min(1).max(60),
  icon: taskTypeIconSchema,
  color: stageColorSchema,
  description: z.string().trim().max(500).optional(),
  base: taskTypeBaseSchema,
});
export type CreateTaskTypeBody = z.infer<typeof createTaskTypeBodySchema>;

/** `PATCH /tasks/types/:id` — свойства типа (сохраняются сразу, публикации
 *  требует только маршрут); системному типу имя менять можно (это данные),
 *  архивировать — нельзя. */
export const updateTaskTypeBodySchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    icon: taskTypeIconSchema.optional(),
    color: stageColorSchema.optional(),
    description: z.string().trim().max(500).nullable().optional(),
    creatable: z.boolean().optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'empty update' });
export type UpdateTaskTypeBody = z.infer<typeof updateTaskTypeBodySchema>;

/** `POST /tasks/:id/type` — смена типа задачи. Если текущего статуса нет в
 *  новом маршруте — обязателен `stageId` (куда встать; подсказка дефолта —
 *  первый живой статус того же этапа, иначе начальный). */
export const changeTaskTypeBodySchema = z.object({
  typeId: z.uuid(),
  stageId: z.uuid().optional(),
});
export type ChangeTaskTypeBody = z.infer<typeof changeTaskTypeBodySchema>;
