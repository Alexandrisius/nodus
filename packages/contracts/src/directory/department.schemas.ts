import { z } from 'zod';

/**
 * Подразделения (directory.Department) — дерево оргструктуры.
 * kind=management — управленческая структура (по ней работают БП и задачи);
 * kind=legal — юридическая (трудовая книжка; эпик M2 #18: структуры расходятся).
 * У подразделения — руководитель (headId) и постоянный заместитель (deputyId).
 */

export const orgUnitKindSchema = z.enum(['management', 'legal']);
export type OrgUnitKind = z.infer<typeof orgUnitKindSchema>;

export const departmentSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  kind: orgUnitKindSchema,
  parentId: z.uuid().nullable(),
  headId: z.uuid().nullable(),
  deputyId: z.uuid().nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});

export type Department = z.infer<typeof departmentSchema>;

/** Узел дерева оргструктуры (рекурсивный) с денормализованными именами для UI. */
export const departmentNodeSchema: z.ZodType<DepartmentNode> = z.lazy(() =>
  departmentSchema.extend({
    headName: z.string().nullable(),
    deputyName: z.string().nullable(),
    /** Число активных сотрудников, прикреплённых к подразделению (не рекурсивно). */
    memberCount: z.number().int().nonnegative(),
    children: z.array(departmentNodeSchema),
  }),
);

export interface DepartmentNode extends Department {
  headName: string | null;
  deputyName: string | null;
  memberCount: number;
  children: DepartmentNode[];
}

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(1).max(256),
  kind: orgUnitKindSchema.default('management'),
  parentId: z.uuid().nullable().default(null),
  headId: z.uuid().nullable().default(null),
  deputyId: z.uuid().nullable().default(null),
  sortOrder: z.number().int().min(0).default(0),
});

export type CreateDepartmentDto = z.infer<typeof createDepartmentSchema>;

export const updateDepartmentSchema = createDepartmentSchema.partial();

export type UpdateDepartmentDto = z.infer<typeof updateDepartmentSchema>;
