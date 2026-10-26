import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { CustomFieldDefinition, CustomFieldScope } from '@nodus/contracts';

import {
  TransactionRunner,
  type TransactionClient,
} from '../../../core/database/transaction-runner.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import { EventBus } from '../../../core/events/event-bus.js';
import {
  PROCESS_CATALOG_READER,
  type ProcessCatalogReader,
} from '../../workflows/ports/process-catalog-reader.port.js';
import {
  WORKFLOW_FIELD_USAGE_READER,
  type WorkflowFieldUsageReader,
} from '../../workflows/ports/workflow-field-usage.port.js';
import { DefinitionMapper, type FieldDefinitionRow } from './definition.mapper.js';
import { emitDefinitionChanged } from './definition-events.js';
import { DefinitionsRepository } from './definitions.repository.js';
import { assertBindable, assertUnbindable } from './type-bindings.js';

/**
 * Привязка атрибута к типам процессов (#432, Р8): точечные PUT/DELETE.
 * Вынесено из `DefinitionsService`, чтобы реестр оставался в лимите строк
 * (I5), а правило «снятие не ломает работающий маршрут» жило рядом с
 * привязкой. Обе операции идемпотентны: повтор — не ошибка (клиент мог не
 * получить ответ), событие всё равно уходит — кэши владельцев сходятся.
 */
@Injectable()
export class DefinitionsBindingService {
  constructor(
    private readonly definitions: DefinitionsRepository,
    private readonly mapper: DefinitionMapper,
    private readonly txRunner: TransactionRunner,
    private readonly eventBus: EventBus,
    @Inject(WORKFLOW_FIELD_USAGE_READER) private readonly workflows: WorkflowFieldUsageReader,
    @Inject(PROCESS_CATALOG_READER) private readonly catalog: ProcessCatalogReader,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DefinitionsBindingService.name);
  }

  async bind(id: string, typeId: string, actorId: string): Promise<CustomFieldDefinition> {
    const definition = await this.require(id);
    await assertBindable(this.catalog, definition.scope, [typeId]);
    return this.txRunner.run(async (tx) => {
      await this.definitions.lockScope(definition.scope, tx);
      await this.definitions.bindType(id, typeId, tx);
      return this.afterChange(tx, id, actorId);
    });
  }

  /** Снятие блокируется, пока атрибут работает в опубликованном маршруте
   *  этого типа (окно перехода, условие, форма создания) — иначе публикация
   *  уже работающего маршрута стала бы невалидной (409 со списком процессов). */
  async unbind(id: string, typeId: string, actorId: string): Promise<CustomFieldDefinition> {
    const definition = await this.require(id);
    const scope = definition.scope as CustomFieldScope;
    await assertUnbindable(this.workflows, scope, id, [typeId]);
    return this.txRunner.run(async (tx) => {
      await this.definitions.lockScope(scope, tx);
      await this.definitions.unbindType(id, typeId, tx);
      return this.afterChange(tx, id, actorId);
    });
  }

  private async require(id: string): Promise<FieldDefinitionRow> {
    const row = await this.definitions.findById(id);
    if (!row) throw DomainException.notFound('Custom field not found', { definitionId: id });
    return row;
  }

  private async afterChange(
    tx: TransactionClient,
    id: string,
    actorId: string,
  ): Promise<CustomFieldDefinition> {
    const row = await this.definitions.findById(id, tx);
    if (!row) throw DomainException.notFound('Custom field not found', { definitionId: id });
    await emitDefinitionChanged(
      { eventBus: this.eventBus, logger: this.logger },
      tx,
      row,
      'updated',
      actorId,
      ['typeIds'],
    );
    return this.mapper.toDto(row, tx);
  }
}
