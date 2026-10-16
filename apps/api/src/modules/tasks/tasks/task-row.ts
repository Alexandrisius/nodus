import type { Prisma } from '../../../generated/prisma/client.js';

/** Выборка строки задачи для DTO списка (personalStageId — размещение
 *  смотрящего). Одна форма на все чтения — маппер не гадает о полях. */
export function taskListInclude(viewerId: string) {
  return {
    type: { select: { id: true, code: true, name: true } },
    stage: true,
    participants: { orderBy: { createdAt: 'asc' } },
    placements: { where: { userId: viewerId }, select: { stageId: true } },
  } satisfies Prisma.TaskInclude;
}

export type TaskListRow = Prisma.TaskGetPayload<{ include: ReturnType<typeof taskListInclude> }>;
