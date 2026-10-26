import type { TaskStageWithCount } from '@nodus/contracts';

import type { ProcessCatalogReader } from '../../workflows/ports/process-catalog-reader.port.js';
import { stageDto } from './task-dto.mapper.js';

/** Счётчик стадий по фильтру видимости (делегат query-репозитория). */
export type StageCountsGetter = () => Promise<{
  all: { stageId: string; _count: { _all: number } }[];
  overdue: { stageId: string; _count: { _all: number } }[];
}>;

/**
 * Каталог стадий со счётчиками (#378, вынесен из TasksQueryService — I5):
 * `typeId` — статусы одного типа; без — всех живых типов категории задач с
 * полями typeId/typeName (межтиповой фильтр «Тип · Статус»). Стадии и типы —
 * данные модуля «Процессы»: читаются портом `PROCESS_CATALOG_READER`
 * (ADR-0024), счётчики задач — свои.
 */
export async function stagesCatalog(
  catalog: ProcessCatalogReader,
  countsOf: StageCountsGetter,
  typeId?: string,
  viewerId?: string,
): Promise<TaskStageWithCount[]> {
  const [counts, entries] = await Promise.all([
    countsOf(),
    catalog.stagesCatalog({
      category: 'task',
      ...(typeId ? { typeId } : {}),
      ...(viewerId ? { viewerId } : {}),
    }),
  ]);
  return entries.map((stage) => ({
    ...stageDto(stage),
    ...(typeId ? {} : { typeId: stage.typeId, typeName: stage.typeName }),
    count: counts.all.find((c) => c.stageId === stage.id)?._count._all ?? 0,
    overdueCount: counts.overdue.find((c) => c.stageId === stage.id)?._count._all ?? 0,
  }));
}
