import { Injectable } from '@nestjs/common';
import type { CreatePositionDto, OrgUnitKind, Position, UpdatePositionDto } from '@nodus/contracts';

import { TransactionRunner } from '../../core/database/transaction-runner.js';
import { DomainException } from '../../core/errors/domain-exception.js';
import { EventBus } from '../../core/events/event-bus.js';
import { PositionsRepository } from './positions.repository.js';

/** Должности: справочник (I15), удаления нет — только архивация. */
@Injectable()
export class PositionsService {
  constructor(
    private readonly positions: PositionsRepository,
    private readonly tx: TransactionRunner,
    private readonly eventBus: EventBus,
  ) {}

  list(kind: OrgUnitKind, includeArchived = false): Promise<Position[]> {
    return this.positions.findAllByKind(kind, includeArchived);
  }

  async create(dto: CreatePositionDto, actorId: string): Promise<Position> {
    // Уникальность (name, kind) — ограничение БД; дубликат → CONFLICT фильтром (P2002).
    return this.tx.run(async (tx) => {
      const created = await this.positions.create(dto, tx);
      await this.eventBus.emit(
        tx,
        'directory.position.created',
        { positionId: created.id, kind: created.kind },
        { actorId, aggregateType: 'position', aggregateId: created.id },
      );
      return created;
    });
  }

  async update(id: string, dto: UpdatePositionDto, actorId: string): Promise<Position> {
    await this.ensureExists(id);
    return this.tx.run(async (tx) => {
      const updated = await this.positions.update(id, dto, tx);
      await this.eventBus.emit(
        tx,
        'directory.position.updated',
        { positionId: id, changedFields: Object.keys(dto) },
        { actorId, aggregateType: 'position', aggregateId: id },
      );
      return updated;
    });
  }

  async archive(id: string, actorId: string): Promise<void> {
    await this.ensureExists(id);
    await this.tx.run(async (tx) => {
      await this.positions.update(id, { isActive: false }, tx);
      await this.eventBus.emit(
        tx,
        'directory.position.archived',
        { positionId: id },
        { actorId, aggregateType: 'position', aggregateId: id },
      );
    });
  }

  private async ensureExists(id: string): Promise<void> {
    if (!(await this.positions.findById(id))) {
      throw DomainException.notFound('Position not found');
    }
  }
}
