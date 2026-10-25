import type { Prisma } from '../../../generated/prisma/client.js';

/** Выборка строки задачи для DTO списка (personalStageId — размещение
 *  смотрящего). Одна форма на все чтения — маппер не гадает о полях.
 *  Тип и стадия живут в модуле «Процессы» (ADR-0024): связи в Prisma сняты,
 *  DTO гидратируется read-портом `PROCESS_CATALOG_READER` по typeId/stageId. */
export function taskListInclude(viewerId: string) {
  return {
    participants: { orderBy: { createdAt: 'asc' } },
    placements: { where: { userId: viewerId }, select: { stageId: true } },
  } satisfies Prisma.TaskInclude;
}

export type TaskListRow = Prisma.TaskGetPayload<{ include: ReturnType<typeof taskListInclude> }>;
