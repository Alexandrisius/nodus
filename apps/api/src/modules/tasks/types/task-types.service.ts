import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  ErrorCode,
  TASK_EVENTS,
  type AuthUser,
  type CreateTaskTypeBody,
  type TaskType,
  type TaskTypeIcon,
  type StageColor,
  type UpdateTaskTypeBody,
} from '@nodus/contracts';

import { TransactionRunner } from '../../../core/database/transaction-runner.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import { EventBus } from '../../../core/events/event-bus.js';
import { WorkflowRepository } from '../workflow/workflow.repository.js';
import { TaskTypesRepository } from './task-types.repository.js';

/**
 * Библиотека типов задач (#378): список читают все вошедшие (решение
 * владельца), мутации — право `task.workflow_manage` (гвард контроллера).
 * Создание: тип + маршрут-основа (копия существующего или простой) одной
 * транзакцией; тип рождается скрытым (`creatable=false`). Свойства
 * сохраняются сразу и ставят `customizedAt` — каталог «засев один раз»
 * больше не трогает тип и его маршрут.
 */
@Injectable()
export class TaskTypesService {
  constructor(
    private readonly txRunner: TransactionRunner,
    private readonly repo: TaskTypesRepository,
    private readonly workflows: WorkflowRepository,
    private readonly eventBus: EventBus,
  ) {}

  async list(archived: 'exclude' | 'include' | 'only'): Promise<TaskType[]> {
    const [rows, workflowMap] = await Promise.all([
      this.repo.list(archived),
      this.repo.workflowMap(),
    ]);
    return rows.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      icon: t.icon as TaskTypeIcon,
      color: t.color as StageColor,
      description: t.description,
      creatable: t.creatable,
      structural: t.structural,
      isSystem: t.isSystem,
      sortOrder: t.sortOrder,
      archivedAt: t.archivedAt?.toISOString() ?? null,
      workflowId: workflowMap.get(t.id) ?? '',
    }));
  }

  async create(user: AuthUser, body: CreateTaskTypeBody): Promise<TaskType> {
    if (await this.repo.findLiveByName(body.name)) {
      throw new DomainException(ErrorCode.TASK_TYPE_NAME_TAKEN, 'Type name already taken');
    }
    const sortOrder = await this.repo.maxSortOrder();
    const created = await this.txRunner.run(async (tx) => {
      const type = await tx.taskType.create({
        data: {
          code: `custom-${randomBytes(4).toString('hex')}`,
          name: body.name,
          icon: body.icon,
          color: body.color,
          description: body.description ?? '',
          creatable: false,
          customizedAt: new Date(),
          catalogRevision: 2,
          sortOrder,
        },
      });
      const workflowId = await this.copyBase(tx, user.id, type.name, body);
      await this.repo.attachToDefaultScheme(tx, type.id, workflowId);
      await this.eventBus.emit(
        tx,
        TASK_EVENTS.TYPE_CREATED,
        { typeId: type.id, name: type.name },
        { actorId: user.id, aggregateType: 'task_type', aggregateId: type.id },
      );
      return { type, workflowId };
    });
    return {
      id: created.type.id,
      code: created.type.code,
      name: created.type.name,
      icon: created.type.icon as TaskTypeIcon,
      color: created.type.color as StageColor,
      description: created.type.description,
      creatable: created.type.creatable,
      structural: created.type.structural,
      isSystem: created.type.isSystem,
      sortOrder: created.type.sortOrder,
      archivedAt: null,
      workflowId: created.workflowId,
    };
  }

  private async copyBase(
    tx: Parameters<Parameters<TransactionRunner['run']>[0]>[0],
    actorId: string,
    name: string,
    body: CreateTaskTypeBody,
  ): Promise<string> {
    if (body.base.kind === 'simple') {
      return this.repo.createSimpleWorkflow(tx, { name, publishedById: actorId });
    }
    const workflowId = await this.repo.workflowIdOf(body.base.typeId);
    const source = await this.workflows.load(workflowId, tx);
    return this.repo.copyWorkflow(tx, source, { name, publishedById: actorId });
  }

  async update(user: AuthUser, id: string, body: UpdateTaskTypeBody): Promise<void> {
    const type = await this.repo.list('include').then((rows) => rows.find((t) => t.id === id));
    if (!type) throw DomainException.notFound('Task type not found');
    if (body.name !== undefined && body.name !== type.name) {
      if (await this.repo.findLiveByName(body.name, id)) {
        throw new DomainException(ErrorCode.TASK_TYPE_NAME_TAKEN, 'Type name already taken');
      }
    }
    const fields = Object.keys(body) as (keyof UpdateTaskTypeBody)[];
    const { description, ...rest } = body;
    await this.txRunner.run(async (tx) => {
      await tx.taskType.update({
        where: { id },
        data: {
          ...rest,
          // Контракт разрешает null (сброс), поле БД NOT NULL — пустая строка.
          ...(description !== undefined ? { description: description ?? '' } : {}),
          customizedAt: new Date(),
        },
      });
      await this.eventBus.emit(
        tx,
        TASK_EVENTS.TYPE_UPDATED,
        { typeId: id, fields: fields as string[] },
        { actorId: user.id, aggregateType: 'task_type', aggregateId: id },
      );
    });
  }

  async setArchived(user: AuthUser, id: string, archived: boolean): Promise<void> {
    const type = await this.repo.list('include').then((rows) => rows.find((t) => t.id === id));
    if (!type) throw DomainException.notFound('Task type not found');
    if (type.isSystem && archived) {
      throw new DomainException(
        ErrorCode.TASK_TYPE_SYSTEM_LOCKED,
        'System task type cannot be archived',
      );
    }
    await this.txRunner.run(async (tx) => {
      await tx.taskType.update({
        where: { id },
        data: { archivedAt: archived ? new Date() : null, customizedAt: new Date() },
      });
      await this.eventBus.emit(
        tx,
        archived ? TASK_EVENTS.TYPE_ARCHIVED : TASK_EVENTS.TYPE_UPDATED,
        archived ? { typeId: id } : { typeId: id, fields: ['archivedAt'] },
        { actorId: user.id, aggregateType: 'task_type', aggregateId: id },
      );
    });
  }
}
