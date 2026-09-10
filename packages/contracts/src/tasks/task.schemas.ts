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

/** Цвет стадии — ключ палитры тонов темы (не hex: тема подменяет значения). */
export const stageColorSchema = z.enum(['neutral', 'info', 'success', 'warning', 'danger']);
export type StageColor = z.infer<typeof stageColorSchema>;

/** Стадия workflow-схемы = колонка канбана (ADR-0008: схемы двух масштабов —
 *  проектная и личная «Мой план»; у личной та же форма + привязка к
 *  системному состоянию для встроенного автоперемещения). */
export const taskStageSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  order: z.number().int().min(0),
  systemState: taskSystemStateSchema,
  color: stageColorSchema,
});

export type TaskStage = z.infer<typeof taskStageSchema>;

/** Стадия + счётчики колонки канбана (шапки и сводка страницы; totals в
 * list-ответах запрещены каноном api-conventions — счётчики живут в каталоге). */
export const taskStageWithCountSchema = taskStageSchema.extend({
  count: z.number().int().min(0),
  overdueCount: z.number().int().min(0),
});

export type TaskStageWithCount = z.infer<typeof taskStageWithCountSchema>;

export const projectRefSchema = z.object({
  id: z.uuid(),
  code: z.string().min(1),
  name: z.string().min(1),
});

export type ProjectRef = z.infer<typeof projectRefSchema>;

/** Ссылка на задачу (для связей из других модулей — чат задачи и пр.). */
export const taskRefSchema = z.object({
  id: z.uuid(),
  number: z.number().int().min(1),
  title: z.string().min(1),
});

export type TaskRef = z.infer<typeof taskRefSchema>;

export const taskListItemSchema = z.object({
  id: z.uuid(),
  number: z.number().int().min(1),
  title: z.string().min(1),
  stage: taskStageSchema,
  /** Размещение на личной доске «Мой план» текущего пользователя
   *  (TaskPersonalPlacement, ADR-0008); null — ещё не раскладывалась. */
  personalStageId: z.uuid().nullable(),
  priority: taskPrioritySchema,
  deadline: z.iso.datetime().nullable(),
  creator: userRefSchema,
  assignee: userRefSchema.nullable(),
  participants: z.array(userRefSchema),
  project: projectRefSchema.nullable(),
  /** Родительская задача (вложенность: граф уровней в списке). */
  parentId: z.uuid().nullable(),
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

/** Узел доменной цепочки сущности (Письмо → Резолюция → Поручение → Задача). */
export const taskChainNodeSchema = z.object({
  kind: z.enum(['letter', 'resolution', 'instruction', 'task', 'chat_message']),
  /** Человекочитаемый ключ узла (Вх-2026/118, ПП-57, № 105). */
  ref: z.string().min(1),
  /** Короткое содержание узла. */
  label: z.string().min(1),
  /** Статус узла, если есть («Согласовано»). */
  state: z.string().optional(),
  /** Сущность для перехода по клику (письмо, чат). */
  entityId: z.uuid().optional(),
});

export type TaskChainNode = z.infer<typeof taskChainNodeSchema>;

export const taskDetailSchema = taskListItemSchema.extend({
  description: z.string(),
  observers: z.array(userRefSchema),
  checklist: z.array(checklistItemSchema),
  subtasks: z.array(taskListItemSchema),
  /** Доменная цепочка происхождения; последний узел — текущая задача. */
  chain: z.array(taskChainNodeSchema),
  createdAt: z.iso.datetime(),
});

export type TaskDetail = z.infer<typeof taskDetailSchema>;

export const createSubtaskBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
});

export type CreateSubtaskBody = z.infer<typeof createSubtaskBodySchema>;

/** Быстрое создание задачи из колонки доски (плюсик в шапке): название +
 *  колонка одной из осей — личная («Мой план»: глобальная стадия подставляется
 *  по состоянию колонки) или глобальная (проектная доска: схема проекта).
 *  projectId — для создания в колонку проектной доски. */
export const createTaskBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    personalStageId: z.uuid().optional(),
    stageId: z.uuid().optional(),
    projectId: z.uuid().optional(),
  })
  .refine((v) => v.personalStageId !== undefined || v.stageId !== undefined, {
    message: 'personalStageId or stageId required',
  });

export type CreateTaskBody = z.infer<typeof createTaskBodySchema>;

/** DTO обновления задачи: перенос между стадиями (канбан, drag-and-drop) —
 *  глобальной (stageId, степпер/проектная доска) или личной (personalStageId,
 *  «Мой план»). index — позиция внутри целевой колонки (порядок persistится,
 *  не «отщёлкивается» после refetch). Хотя бы одна ось обязательна. */
export const taskUpdateBodySchema = z
  .object({
    stageId: z.uuid().optional(),
    personalStageId: z.uuid().optional(),
    index: z.number().int().min(0).optional(),
  })
  .refine((v) => v.stageId !== undefined || v.personalStageId !== undefined, {
    message: 'stageId or personalStageId required',
  });

export type TaskUpdateBody = z.infer<typeof taskUpdateBodySchema>;

/** CRUD личных стадий «Моего плана» (личная схема пользователя, ADR-0008).
 *  Удаление — DELETE /tasks/personal-stages/:id (последняя запрещена — 409);
 *  задачи удаляемой колонки переезжают в первую колонку того же состояния. */
export const personalStageCreateBodySchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: stageColorSchema,
  systemState: taskSystemStateSchema,
});

export type PersonalStageCreateBody = z.infer<typeof personalStageCreateBodySchema>;

export const personalStageUpdateBodySchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    color: stageColorSchema.optional(),
    systemState: taskSystemStateSchema.optional(),
    order: z.number().int().min(0).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'empty update' });

export type PersonalStageUpdateBody = z.infer<typeof personalStageUpdateBodySchema>;

/** Ветка задачи для панели-навигатора: дерево от корневого предка,
 *  вложенность любой глубины; текущая задача резолвится на клиенте по id. */
export interface TaskBranchNode {
  id: string;
  number: number;
  title: string;
  stageName: string;
  stageColor: StageColor;
  systemState: TaskSystemState;
  children: TaskBranchNode[];
}

export const taskBranchNodeSchema: z.ZodType<TaskBranchNode> = z.lazy(() =>
  z.object({
    id: z.uuid(),
    number: z.number().int().min(1),
    title: z.string().min(1),
    stageName: z.string().min(1),
    stageColor: stageColorSchema,
    systemState: taskSystemStateSchema,
    children: z.array(taskBranchNodeSchema),
  }),
);

export const taskBranchSchema = z.object({ root: taskBranchNodeSchema });
export type TaskBranch = z.infer<typeof taskBranchSchema>;

export const listTasksQuerySchema = cursorQuerySchema.extend({
  /** 'assignee' | 'creator' | 'participant' — роли текущего пользователя. */
  scope: z.enum(['mine', 'all']).default('mine'),
  view: z.enum(['list', 'kanban']).default('kanban'),
  search: z.string().trim().min(1).max(128).optional(),
  /** Фид колонки канбана: курсорная подгрузка порциями (industry-паттерн:
   *  колонки держат тысячи карточек, целиком не отдаются). */
  stageId: z.uuid().optional(),
  /** Фид колонки личной доски «Мой план» (по TaskPersonalPlacement). */
  personalStageId: z.uuid().optional(),
  /** Задачи проекта (список/канбан в карточке проекта). */
  projectId: z.uuid().optional(),
  /** Задачи исполнителя (вкладка «Задачи» карточки сотрудника). */
  assigneeId: z.uuid().optional(),
});

export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
