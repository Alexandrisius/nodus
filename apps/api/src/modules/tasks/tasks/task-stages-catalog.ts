import type { TaskStageWithCount } from '@nodus/contracts';

import { stageDto } from './task-dto.mapper.js';
import type { WorkflowRepository } from '../workflow/workflow.repository.js';

/** Счётчик стадий по фильтру видимости (делегат query-репозитория). */
export type StageCountsGetter = () => Promise<{
  all: { stageId: string; _count: { _all: number } }[];
  overdue: { stageId: string; _count: { _all: number } }[];
}>;

/**
 * Каталог стадий со счётчиками (#378, вынесен из TasksQueryService — I5):
 * `typeId` — статусы одного типа; без — всех живых типов с полями
 * typeId/typeName (межтиповой фильтр «Тип · Статус»).
 */
export async function stagesCatalog(
  workflows: WorkflowRepository,
  countsOf: StageCountsGetter,
  typeId?: string,
): Promise<TaskStageWithCount[]> {
  const counts = await countsOf();
  const withCounts = (stage: Awaited<ReturnType<typeof workflows.findStages>>[number]) => ({
    ...stageDto(stage),
    count: counts.all.find((c) => c.stageId === stage.id)?._count._all ?? 0,
    overdueCount: counts.overdue.find((c) => c.stageId === stage.id)?._count._all ?? 0,
  });

  if (typeId) {
    const resolved = await workflows.resolveTypeWorkflow(typeId);
    return (await workflows.findStages(resolved.workflowId)).map(withCounts);
  }

  const types = await workflows.listTypes();
  const workflowMap = await workflows.typeWorkflowMap();
  const result: TaskStageWithCount[] = [];
  for (const type of types) {
    const workflowId = workflowMap.get(type.id);
    if (!workflowId) continue;
    const stages = await workflows.findStages(workflowId);
    result.push(
      ...stages.map((stage) => ({
        ...withCounts(stage),
        typeId: type.id,
        typeName: type.name,
      })),
    );
  }
  return result;
}
