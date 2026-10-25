import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';

import { WorkflowEntityRegistry } from './workflow/engine/entity-adapter.registry.js';
import { WorkflowEngine } from './workflow/engine/workflow-engine.js';
import { WorkflowRepository } from './workflow/workflow.repository.js';
import { ProcessCatalogReaderProvider } from './ports/process-catalog-reader.provider.js';
import { PROCESS_CATALOG_READER } from './ports/process-catalog-reader.port.js';
import { WORKFLOW_ENGINE } from './ports/workflow-engine.port.js';
import { ProcessTypesRepository } from './types/process-types.repository.js';

/**
 * Порты «Процессов» для модулей-владельцев сущностей (ADR-0012, ADR-0024):
 * `WORKFLOW_ENGINE` (доступные переходы и выполнение в транзакции
 * вызывающего) и `PROCESS_CATALOG_READER` (гидратация типов и стадий,
 * разрешение типа в маршрут, каталог стадий). Доменные сервисы редактора и
 * публикации наружу не экспортируются. Реестр адаптеров и репозитории
 * экспортируются для СОБСТВЕННЫХ сервисов WorkflowsModule (редактор, типы,
 * фоновый перенос), не для чужих модулей: чужой модуль берёт только токены
 * портов.
 */
@Module({
  // DiscoveryService — скан провайдеров со `static readonly workflowCategory`
  // при bootstrap (тот же приём, что eventType у обработчиков событий).
  imports: [DiscoveryModule],
  providers: [
    WorkflowRepository,
    ProcessTypesRepository,
    WorkflowEntityRegistry,
    WorkflowEngine,
    ProcessCatalogReaderProvider,
    { provide: WORKFLOW_ENGINE, useExisting: WorkflowEngine },
    { provide: PROCESS_CATALOG_READER, useExisting: ProcessCatalogReaderProvider },
  ],
  exports: [
    WORKFLOW_ENGINE,
    PROCESS_CATALOG_READER,
    WorkflowEntityRegistry,
    WorkflowRepository,
    ProcessTypesRepository,
  ],
})
export class WorkflowsPortsModule {}
