import { Injectable } from '@nestjs/common';
import type { CreatePositionDto, OrgUnitKind, Position, UpdatePositionDto } from '@nodus/contracts';

import { TransactionRunner } from '../../core/database/transaction-runner.js';
import { DomainException } from '../../core/errors/domain-exception.js';
import { PositionsRepository } from './positions.repository.js';

/** Должности: справочник (I15), удаления нет — только архивация. */
@Injectable()
export class PositionsService {
  constructor(
    private readonly positions: PositionsRepository,
    private readonly tx: TransactionRunner,
  ) {}

  list(kind: OrgUnitKind, includeArchived = false): Promise<Position[]> {
    return this.positions.findAllByKind(kind, includeArchived);
  }

  async create(dto: CreatePositionDto): Promise<Position> {
    // Уникальность (name, kind) — ограничение БД; дубликат → CONFLICT фильтром (P2002).
    return this.tx.run(async (tx) => this.positions.create(dto, tx));
  }

  async update(id: string, dto: UpdatePositionDto): Promise<Position> {
    await this.ensureExists(id);
    return this.tx.run(async (tx) => this.positions.update(id, dto, tx));
  }

  async archive(id: string): Promise<void> {
    await this.ensureExists(id);
    await this.tx.run(async (tx) => {
      await this.positions.update(id, { isActive: false }, tx);
    });
  }

  private async ensureExists(id: string): Promise<void> {
    if (!(await this.positions.findById(id))) {
      throw DomainException.notFound('Position not found');
    }
  }
}
