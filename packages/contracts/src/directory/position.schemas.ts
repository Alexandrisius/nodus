import { z } from 'zod';

import { orgUnitKindSchema } from './department.schemas.js';

/**
 * Должности (directory.Position) — плоский справочник с kind:
 * management (управленческая, видна в интерфейсе) и legal (юридическая,
 * по трудовой книжке). Удаления нет — только архивация (isActive, I15).
 */

export const positionSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  kind: orgUnitKindSchema,
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});

export type Position = z.infer<typeof positionSchema>;

export const createPositionSchema = z.object({
  name: z.string().trim().min(1).max(256),
  kind: orgUnitKindSchema.default('management'),
  sortOrder: z.number().int().min(0).default(0),
});

export type CreatePositionDto = z.infer<typeof createPositionSchema>;

export const updatePositionSchema = createPositionSchema.partial();

export type UpdatePositionDto = z.infer<typeof updatePositionSchema>;
