import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  ErrorCode,
  isDefaultProcessType,
  normalizeTypeConfig,
  Permission,
  WORKFLOW_EVENTS,
  type AuthUser,
  type CreateProcessTypeBody,
  type ProcessCategory,
  type ProcessType,
  type UpdateProcessTypeBody,
  type UpdateProcessTypeConfigBody,
} from '@nodus/contracts';

import { TransactionRunner } from '../../../core/database/transaction-runner.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import { EventBus } from '../../../core/events/event-bus.js';
import {
  ROLE_MEMBERSHIP_READER,
  type RoleMembershipReader,
} from '../../../core/ports/role-membership.port.js';
import { WorkflowEntityRegistry } from '../workflow/engine/entity-adapter.registry.js';
import { WorkflowRepository } from '../workflow/workflow.repository.js';
import { processTypeDto, type ProcessTypeRow } from './process-type.mapper.js';
import { ProcessTypesRepository } from './process-types.repository.js';
import { typeSubjectOf } from './type-subject.js';

/**
 * Библиотека типов процессов (#378, ADR-0024): список читают все вошедшие
 * (решение владельца), мутации — право `workflow.manage` (гвард контроллера).
 * Создание: тип + маршрут-основа (копия существующего или простой) одной
 * транзакцией; тип рождается скрытым (`creatable=false`). Категория
 * (`task | letter`) неизменяема: от неё зависят карточка и адаптер движка.
 * Свойства сохраняются сразу и ставят `customizedAt` — каталог «засев один
 * раз» больше не трогает тип и его маршрут.
 *
 * #432: DTO несёт конфигурацию типа (карточка и доступ), опубликованную
 * форму создания маршрута и права зрителя. Без `workflow.manage` список
 * отдаёт только видимые типы — невидимые не раскрываются даже названием.
 */
@Injectable()
export class ProcessTypesService {
  constructor(
    private readonly txRunner: TransactionRunner,
    private readonly repo: ProcessTypesRepository,
    private readonly workflows: WorkflowRepository,
    private readonly adapters: WorkflowEntityRegistry,
    private readonly eventBus: EventBus,
    @Inject(ROLE_MEMBERSHIP_READER) private readonly membership: RoleMembershipReader,
  ) {}

  async list(
    user: AuthUser,
    archived: 'exclude' | 'include' | 'only',
    category?: ProcessCategory,
  ): Promise<ProcessType[]> {
    const [rows, workflowMap, subject] = await Promise.all([
      this.repo.list(archived, category),
      this.repo.workflowMap(),
      this.subjectOf(user.id),
    ]);
    const creations = await this.repo.creationMap([...workflowMap.values()]);
    const manage = user.permissions.includes(Permission.WORKFLOW_MANAGE);
    return rows
      .map((row) => {
        const workflowId = workflowMap.get(row.id) ?? '';
        return processTypeDto(row, workflowId, {
          creation: creations.get(workflowId),
          subject,
        });
      })
      .filter((type) => manage || type.viewer.canView);
  }

  async create(user: AuthUser, body: CreateProcessTypeBody): Promise<ProcessType> {
    // Категория без адаптера сущности (письма — #55) пока не исполнима:
    // тип создался бы, а маршрут нельзя ни прочитать, ни опубликовать.
    if (!this.adapters.has(body.category)) {
      throw new DomainException(ErrorCode.CONFLICT, 'Process category is not available yet');
    }
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
    return this.dtoOf(user.id, created.type, created.workflowId);
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
    // Копия типа работает как оригинал: форма создания едет вместе с маршрутом.
    const creation = await this.workflows.creationOf(workflowId, tx);
    return this.repo.copyWorkflow(tx, source, { name, publishedById: actorId, kind, creation });
  }

  async update(user: AuthUser, id: string, body: UpdateProcessTypeBody): Promise<ProcessType> {
    const type = await this.repo.findById(id);
    if (!type) throw DomainException.notFound('Process type not found');
    // «Стандартный» — тип быстрых входов: выключить создание нельзя (О8),
    // иначе плюсики колонок, подзадачи и «В задачу» остались бы без типа.
    if (isDefaultProcessType(type) && body.creatable === false) {
      throw new DomainException(ErrorCode.PROCESS_TYPE_SYSTEM_LOCKED, 'Default type is locked', {
        reason: 'default_type',
      });
    }
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
    return this.byId(user.id, id);
  }

  /**
   * «Настройки типа» (#432, Р11): разделы заменяются ЦЕЛИКОМ и сохраняются
   * сразу — публикации требует только форма создания (она часть маршрута).
   * «Стандартный»: доступ у него всегда «всем» (О8) — закрыть его значило бы
   * сломать быстрые входы, которыми пользуется весь штат.
   */
  async updateConfig(
    user: AuthUser,
    id: string,
    body: UpdateProcessTypeConfigBody,
  ): Promise<ProcessType> {
    const type = await this.repo.findById(id);
    if (!type) throw DomainException.notFound('Process type not found');
    const access = body.access;
    if (isDefaultProcessType(type) && access && (access.view !== null || access.create !== null)) {
      throw new DomainException(ErrorCode.PROCESS_TYPE_SYSTEM_LOCKED, 'Default type is locked', {
        reason: 'default_type',
      });
    }
    const config = { ...normalizeTypeConfig(type.config), ...body };
    await this.txRunner.run(async (tx) => {
      await this.repo.updateConfig(tx, id, config);
      await this.eventBus.emit(
        tx,
        WORKFLOW_EVENTS.TYPE_UPDATED,
        { typeId: id, fields: Object.keys(body).map((section) => `config.${section}`) },
        { actorId: user.id, aggregateType: 'process_type', aggregateId: id },
      );
    });
    return this.byId(user.id, id);
  }

  async setArchived(user: AuthUser, id: string, archived: boolean): Promise<ProcessType> {
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
    return this.byId(user.id, id);
  }

  /** DTO типа по id — ответ мутаций (веб кладёт его в кэш как есть). */
  private async byId(userId: string, id: string): Promise<ProcessType> {
    const type = await this.repo.findById(id);
    if (!type) throw DomainException.notFound('Process type not found');
    const workflowId = await this.repo.workflowIdOf(id).catch(() => '');
    return this.dtoOf(userId, type, workflowId);
  }

  private async dtoOf(
    userId: string,
    type: ProcessTypeRow,
    workflowId: string,
  ): Promise<ProcessType> {
    const [creation, subject] = await Promise.all([
      workflowId ? this.workflows.creationOf(workflowId) : Promise.resolve(null),
      this.subjectOf(userId),
    ]);
    return processTypeDto(type, workflowId, { creation, subject });
  }

  private subjectOf(userId: string) {
    return typeSubjectOf(this.membership, userId);
  }
}
