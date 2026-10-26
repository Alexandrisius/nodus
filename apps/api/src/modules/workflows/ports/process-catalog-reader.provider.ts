import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type ProcessCategory,
  type ProcessType,
  type ProcessTypeRef,
} from '@nodus/contracts';

import { DomainException } from '../../../core/errors/domain-exception.js';
import { STANDARD_PROCESS_TYPE } from '../catalog/system-catalog.js';
import { processTypeDto } from '../types/process-type.mapper.js';
import { ProcessTypesRepository } from '../types/process-types.repository.js';
import { WorkflowRepository } from '../workflow/workflow.repository.js';
import type {
  CatalogStage,
  CatalogStageWithType,
  ProcessCatalogReader,
} from './process-catalog-reader.port.js';

/**
 * Реализация read-порта «Процессов» для модулей-владельцев (ADR-0012,
 * ADR-0024): гидратация типов и стадий, разрешение типа в маршрут с
 * проверкой категории/архива/скрытости, каталог стадий. Наружу отдаются
 * только контракты и формы порта — таблицы «Процессов» не утекают.
 */
@Injectable()
export class ProcessCatalogReaderProvider implements ProcessCatalogReader {
  constructor(
    private readonly types: ProcessTypesRepository,
    private readonly workflows: WorkflowRepository,
  ) {}

  async resolveType(
    typeId: string | undefined,
    opts: { category: ProcessCategory; requireCreatable?: boolean },
  ): Promise<ProcessType> {
    const type = typeId
      ? await this.types.findLiveById(typeId)
      : await this.types.findByCode(STANDARD_PROCESS_TYPE.code);
    // Чужая категория — как отсутствие: задача не может идти по маршруту
    // письма (и наоборот); оракул существования не раскрываем.
    if (!type || type.archivedAt || type.category !== opts.category) {
      throw new DomainException(ErrorCode.NOT_FOUND, 'Process type not found');
    }
    if (opts.requireCreatable && !type.creatable) {
      throw new DomainException(ErrorCode.CONFLICT, 'Process type is not available for creation');
    }
    return processTypeDto(type, await this.types.workflowIdOf(type.id));
  }

  async typeById(id: string): Promise<ProcessType | null> {
    const type = await this.types.findById(id);
    if (!type) return null;
    const workflowId = await this.types.workflowIdOf(type.id).catch(() => '');
    return processTypeDto(type, workflowId);
  }

  async typeRefs(ids: readonly string[], opts: { live?: boolean } = {}): Promise<ProcessTypeRef[]> {
    if (ids.length === 0) return [];
    const rows = await this.types.findByIds(ids);
    return rows
      .filter((t) => !opts.live || t.archivedAt === null)
      .map((t) => ({
        id: t.id,
        code: t.code,
        name: t.name,
        category: t.category as ProcessCategory,
      }));
  }

  liveStages(workflowId: string): Promise<CatalogStage[]> {
    return this.workflows.findStages(workflowId);
  }

  stagesByIds(ids: readonly string[]): Promise<CatalogStage[]> {
    return ids.length === 0 ? Promise.resolve([]) : this.workflows.stagesByIds(ids);
  }

  async findLiveStage(stageId: string): Promise<CatalogStage | null> {
    const stage = await this.workflows.findStageById(stageId);
    return stage && stage.archivedAt === null ? stage : null;
  }

  async stagesCatalog(opts: {
    typeId?: string;
    category: ProcessCategory;
  }): Promise<CatalogStageWithType[]> {
    if (opts.typeId) {
      const type = await this.resolveType(opts.typeId, { category: opts.category });
      const stages = await this.workflows.findStages(type.workflowId);
      return stages.map((s) => ({ ...s, typeId: type.id, typeName: type.name }));
    }
    const types = await this.types.list('exclude', opts.category);
    const workflowMap = await this.types.workflowMap();
    const result: CatalogStageWithType[] = [];
    for (const type of types) {
      const workflowId = workflowMap.get(type.id);
      if (!workflowId) continue;
      const stages = await this.workflows.findStages(workflowId);
      result.push(...stages.map((s) => ({ ...s, typeId: type.id, typeName: type.name })));
    }
    return result;
  }
}
