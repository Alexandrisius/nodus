import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  ErrorCode,
  WORKFLOW_EVENTS,
  type AuthUser,
  type CreateProcessTypeBody,
  type ProcessCategory,
  type ProcessType,
  type UpdateProcessTypeBody,
} from '@nodus/contracts';

import { TransactionRunner } from '../../../core/database/transaction-runner.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import { EventBus } from '../../../core/events/event-bus.js';
import { WorkflowRepository } from '../workflow/workflow.repository.js';
import { processTypeDto } from './process-type.mapper.js';
import { ProcessTypesRepository } from './process-types.repository.js';

/**
 * Библиотека типов процессов (#378, ADR-0024): список читают все вошедшие
 * (решение владельца), мутации — право `workflow.manage` (гвард контроллера).
 * Создание: тип + маршрут-основа (копия существующего или простой) одной
 * транзакцией; тип рождается скрытым (`creatable=false`). Категория
 * (`task | letter`) неизменяема: от неё зависят карточка и адаптер движка.
 * Свойства сохраняются сразу и ставят `customizedAt` — каталог «засев один
 * раз» больше не трогает тип и его маршрут.
 */
@Injectable()
export class ProcessTypesService {
  constructor(
    private readonly txRunner: TransactionRunner,
    private readonly repo: ProcessTypesRepository,
    private readonly workflows: WorkflowRepository,
    private readonly eventBus: EventBus,
  ) {}

  async list(
    archived: 'exclude' | 'include' | 'only',
    category?: ProcessCategory,
  ): Promise<ProcessType[]> {
    const [rows, workflowMap] = await Promise.all([
      this.repo.list(archived, category),
      this.repo.workflowMap(),
    ]);
    return rows.map((t) => processTypeDto(t, workflowMap.get(t.id) ?? ''));
  }

  async create(user: AuthUser, body: CreateProcessTypeBody): Promise<ProcessType> {
    if (await this.repo.findLiveByName(body.name)) {
      throw new DomainException(ErrorCode.PROCESS_TYPE_NAME_TAKEN, 'Type name already taken');
    }
    const sortOrder = await this.repo.maxSortOrder();
    const created = await this.txRunner.run(async (tx) => {
      const type = await this.repo.createType(tx, {
        code: `custom-${randomBytes(4).toString('hex')}`,
        name: body.name,
        category: body.category,
        direction: body.direction ?? null,
        icon: body.icon,
        color: body.color,
        description: body.description ?? '',
        creatable: false,
        customizedAt: new Date(),
        catalogRevision: 2,
        sortOrder,
      });
      const workflowId = await this.copyBase(tx, user.id, type.name, body);
      await this.repo.attachToDefaultScheme(tx, type.id, workflowId);
      await this.eventBus.emit(
        tx,
        WORKFLOW_EVENTS.TYPE_CREATED,
        { typeId: type.id, name: type.name, category: body.category },
        { actorId: user.id, aggregateType: 'process_type', aggregateId: type.id },
      );
      return { type, workflowId };
    });
    return processTypeDto(created.type, created.workflowId);
  }

  private async copyBase(
    tx: Parameters<Parameters<TransactionRunner['run']>[0]>[0],
    actorId: string,
    name: string,
    body: CreateProcessTypeBody,
  ): Promise<string> {
    const kind = body.category;
    if (body.base.kind === 'simple') {
      return this.repo.createSimpleWorkflow(tx, { name, publishedById: actorId, kind });
    }
    // Основа — только живой тип ТОЙ ЖЕ категории (как в диалоге создания):
    // архивный — вне употребления, его маршрут сначала восстанавливают;
    // маршрут задачи не может стать основой письма (карточки разные).
    const base = await this.repo.findById(body.base.typeId);
    if (!base || base.archivedAt || base.category !== body.category) {
      throw DomainException.notFound('Base process type not found');
    }
    const workflowId = await this.repo.workflowIdOf(body.base.typeId);
    const source = await this.workflows.load(workflowId, tx);
    return this.repo.copyWorkflow(tx, source, { name, publishedById: actorId, kind });
  }

  async update(user: AuthUser, id: string, body: UpdateProcessTypeBody): Promise<void> {
    const type = await this.repo.findById(id);
    if (!type) throw DomainException.notFound('Process type not found');
    if (body.name !== undefined && body.name !== type.name) {
      if (await this.repo.findLiveByName(body.name, id)) {
        throw new DomainException(ErrorCode.PROCESS_TYPE_NAME_TAKEN, 'Type name already taken');
      }
    }
    const fields = Object.keys(body) as (keyof UpdateProcessTypeBody)[];
    const { description, ...rest } = body;
    await this.txRunner.run(async (tx) => {
      await this.repo.updateType(tx, id, {
        ...rest,
        // Контракт разрешает null (сброс), поле БД NOT NULL — пустая строка.
        ...(description !== undefined ? { description: description ?? '' } : {}),
        customizedAt: new Date(),
      });
      await this.eventBus.emit(
        tx,
        WORKFLOW_EVENTS.TYPE_UPDATED,
        { typeId: id, fields: fields as string[] },
        { actorId: user.id, aggregateType: 'process_type', aggregateId: id },
      );
    });
  }

  async setArchived(user: AuthUser, id: string, archived: boolean): Promise<void> {
    const type = await this.repo.findById(id);
    if (!type) throw DomainException.notFound('Process type not found');
    if (type.isSystem && archived) {
      throw new DomainException(
        ErrorCode.PROCESS_TYPE_SYSTEM_LOCKED,
        'System process type cannot be archived',
      );
    }
    await this.txRunner.run(async (tx) => {
      await this.repo.updateType(tx, id, {
        archivedAt: archived ? new Date() : null,
        customizedAt: new Date(),
      });
      await this.eventBus.emit(
        tx,
        archived ? WORKFLOW_EVENTS.TYPE_ARCHIVED : WORKFLOW_EVENTS.TYPE_UPDATED,
        archived ? { typeId: id } : { typeId: id, fields: ['archivedAt'] },
        { actorId: user.id, aggregateType: 'process_type', aggregateId: id },
      );
    });
  }
}
