import { z } from 'zod';

import { userRefSchema } from '../directory/user-ref.schema.js';
import { cursorQuerySchema } from '../pagination/paginated.schema.js';

/**
 * Контракты модуля задач (tasks.Task). Системное состояние — скрытое (I15),
 * видимые стадии — из статус-схемы (WorkflowStage); в MVP — одна схема по умолчанию.
 */

export const taskSystemStateSchema = z.enum(['backlog', 'active', 'paused', 'done', 'closed']);
export type TaskSystemState = z.infer<typeof taskSystemStateSchema>;

export const taskPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);
export type TaskPriority = z.infer<typeof taskPrioritySchema>;

export const taskSourceSchema = z.enum(['manual', 'chat_message', 'letter']);
export type TaskSource = z.infer<typeof taskSourceSchema>;

/** Стадия статус-схемы = колонка канбана. */
export const taskStageSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  order: z.number().int().min(0),
  systemState: taskSystemStateSchema,
});

export type TaskStage = z.infer<typeof taskStageSchema>;

export const projectRefSchema = z.object({
  id: z.uuid(),
  code: z.string().min(1),
  name: z.string().min(1),
});

export type ProjectRef = z.infer<typeof projectRefSchema>;

export const taskListItemSchema = z.object({
  id: z.uuid(),
  number: z.number().int().min(1),
  title: z.string().min(1),
  stage: taskStageSchema,
  priority: taskPrioritySchema,
  deadline: z.iso.datetime().nullable(),
  creator: userRefSchema,
  assignee: userRefSchema.nullable(),
  participants: z.array(userRefSchema),
  project: projectRefSchema.nullable(),
  /** Трудозатраты суммарно, минуты (I14). */
  spentMinutes: z.number().int().min(0),
  commentsCount: z.number().int().min(0),
  checklistDone: z.number().int().min(0),
  checklistTotal: z.number().int().min(0),
  source: taskSourceSchema,
  updatedAt: z.iso.datetime(),
});

export type TaskListItem = z.infer<typeof taskListItemSchema>;

export const checklistItemSchema = z.object({
  id: z.uuid(),
  text: z.string().min(1),
  done: z.boolean(),
});

export type ChecklistItem = z.infer<typeof checklistItemSchema>;

export const taskDetailSchema = taskListItemSchema.extend({
  description: z.string(),
  observers: z.array(userRefSchema),
  checklist: z.array(checklistItemSchema),
  subtasks: z.array(taskListItemSchema),
  createdAt: z.iso.datetime(),
});

export type TaskDetail = z.infer<typeof taskDetailSchema>;

export const createSubtaskBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
});

export type CreateSubtaskBody = z.infer<typeof createSubtaskBodySchema>;

export const listTasksQuerySchema = cursorQuerySchema.extend({
  /** 'assignee' | 'creator' | 'participant' — роли текущего пользователя. */
  scope: z.enum(['mine', 'all']).default('mine'),
  view: z.enum(['list', 'kanban']).default('kanban'),
  search: z.string().trim().min(1).max(128).optional(),
});

export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
