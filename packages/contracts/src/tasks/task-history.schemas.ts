import { z } from 'zod';

import { userRefSchema } from '../directory/user-ref.schema.js';

/**
 * История задачи (вкладка «История»): события `task.*` агрегата из event
 * log (I9) — свежие первыми, курсор по seq. `payload` — минимальный payload
 * события (каталог TASK_EVENTS), UI рендерит строку по `type`.
 */
export const taskHistoryItemSchema = z.object({
  id: z.uuid(),
  type: z.string().min(1),
  actor: userRefSchema.nullable(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
});
export type TaskHistoryItem = z.infer<typeof taskHistoryItemSchema>;
