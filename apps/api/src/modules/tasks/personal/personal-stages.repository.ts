import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../core/database/prisma.service.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';

/** CHECK `(system_state='closed') = (outcome IS NOT NULL)` (#378): колонка
 *  «Итога» в «Моём плане» — всегда «выполнена» (отмена — свойство маршрута). */
const outcomeOf = (systemState: string): 'success' | null =>
  systemState === 'closed' ? 'success' : null;

/**
 * Колонки личного маршрута «Мой план» (`workflow_stages` личного workflow,
 * ADR-0008): чтение активных, лимит, создание, порядок, правка, архивация.
 * Создание самого личного маршрута — WorkflowRepository.ensurePersonal.
 */
@Injectable()
export class PersonalStagesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Сериализация правок колонок ОДНОЙ доски: архивация/смена состояния
   *  проверяют «не последняя колонка состояния» и лимит по снимку — без лока
   *  две параллельные операции оставили бы состояние без колонок (TOCTOU).
   *  Advisory-лок конкретного владельца до конца tx (паттерн chat #177;
   *  пространство 317 — номер issue аудита, не пересекается с 143/177). */
  async lockBoard(ownerId: string, tx: TransactionClient): Promise<void> {
    await tx.$executeRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(317, hashtext(${ownerId}::text))
    `);
  }

  liveStages(workflowId: string, tx?: TransactionClient) {
    return (tx ?? this.prisma).workflowStage.findMany({
      where: { workflowId, archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  countLive(workflowId: string, tx: TransactionClient): Promise<number> {
    return tx.workflowStage.count({ where: { workflowId, archivedAt: null } });
  }

  /** Порядковый номер новой колонки — после последней (включая архивные). */
  async nextSortOrder(workflowId: string, tx: TransactionClient): Promise<number> {
    const last = await tx.workflowStage.findFirst({
      where: { workflowId },
      orderBy: { sortOrder: 'desc' },
    });
    return (last?.sortOrder ?? -1) + 1;
  }

  create(
    tx: TransactionClient,
    data: {
      workflowId: string;
      name: string;
      color: string;
      systemState: string;
      sortOrder: number;
    },
  ) {
    return tx.workflowStage.create({ data: { ...data, outcome: outcomeOf(data.systemState) } });
  }

  async setSortOrder(tx: TransactionClient, stageId: string, sortOrder: number): Promise<void> {
    await tx.workflowStage.update({ where: { id: stageId }, data: { sortOrder } });
  }

  update(
    tx: TransactionClient,
    stageId: string,
    patch: { name?: string; color?: string; systemState?: string },
  ) {
    const data =
      patch.systemState === undefined ? patch : { ...patch, outcome: outcomeOf(patch.systemState) };
    return tx.workflowStage.update({ where: { id: stageId }, data });
  }

  async archive(tx: TransactionClient, stageId: string, at: Date): Promise<void> {
    await tx.workflowStage.update({ where: { id: stageId }, data: { archivedAt: at } });
  }
}
