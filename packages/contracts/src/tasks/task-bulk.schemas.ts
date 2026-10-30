import { z } from 'zod';

import { taskPrioritySchema } from './task.schemas.js';

/**
 * Массовые операции над задачами (боль Левчука: пакетный перенос срока и
 * стадии). Каждая задача проверяется правами и гейтами индивидуально;
 * ответ — по задаче, частичный успех — норма (не транзакция «всё или ничего»).
 */
export const taskBulkActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('set_deadline'), deadline: z.iso.datetime().nullable() }),
  z.object({ kind: z.literal('set_assignee'), assigneeId: z.uuid() }),
  z.object({ kind: z.literal('set_priority'), priority: taskPrioritySchema }),
  /** Переход маршрута в стадию (у задач разных маршрутов — свой переход). */
  z.object({ kind: z.literal('move_to_stage'), stageId: z.uuid() }),
  /** Перенос в узел структуры проекта (мультиселект + DnD дерева, #467);
   *  null — убрать из структуры («Без узла»). */
  z.object({ kind: z.literal('set_node'), nodeId: z.uuid().nullable() }),
]);
export type TaskBulkAction = z.infer<typeof taskBulkActionSchema>;

export const taskBulkBodySchema = z.object({
  taskIds: z.array(z.uuid()).min(1).max(100),
  action: taskBulkActionSchema,
});
export type TaskBulkBody = z.infer<typeof taskBulkBodySchema>;

export const taskBulkResultSchema = z.object({
  results: z.array(
    z.object({
      taskId: z.uuid(),
      ok: z.boolean(),
      /** Код ошибки (ErrorCode) при ok=false. */
      code: z.string().optional(),
    }),
  ),
});
export type TaskBulkResult = z.infer<typeof taskBulkResultSchema>;
