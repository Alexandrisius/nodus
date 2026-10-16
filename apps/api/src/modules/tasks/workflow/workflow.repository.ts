import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import { ErrorCode } from '@nodus/contracts';
import { PERSONAL_TEMPLATE_CODE, SYSTEM_TASK_TYPE } from '../catalog/system-catalog.js';
import { parseRules, type StageDef, type TransitionDef } from './transition-rules.js';

export interface StageRow extends StageDef {
  workflowId: string;
  color: string;
  sortOrder: number;
  isInitial: boolean;
}

export interface LoadedWorkflow {
  id: string;
  stages: StageRow[];
  transitions: TransitionDef[];
}

/**
 * Маршруты, типы и личные маршруты «Мой план» (ADR-0008/0020). Маршрут
 * задачи читается целиком (стадии + переходы с разобранными правилами) —
 * объём единицы-десятки строк.
 */
@Injectable()
export class WorkflowRepository {
  constructor(private readonly prisma: PrismaService) {}

  async load(workflowId: string, tx?: TransactionClient): Promise<LoadedWorkflow> {
    const db = tx ?? this.prisma;
    const [stages, transitions] = await Promise.all([
      db.workflowStage.findMany({
        where: { workflowId },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      }),
      db.workflowTransition.findMany({ where: { workflowId } }),
    ]);
    return {
      id: workflowId,
      stages,
      transitions: transitions.map((t) => ({
        id: t.id,
        name: t.name,
        fromStageId: t.fromStageId,
        toStageId: t.toStageId,
        sortOrder: t.sortOrder,
        rules: parseRules(t.rules),
      })),
    };
  }

  listTypes() {
    return this.prisma.taskType.findMany({
      where: { archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    });
  }

  /** Тип (по умолчанию системный) и маршрут для него по схеме по умолчанию
   *  (задача без проекта; проектные схемы — ступень 3). */
  async resolveTypeWorkflow(typeId?: string): Promise<{ typeId: string; workflowId: string }> {
    const type = typeId
      ? await this.prisma.taskType.findFirst({ where: { id: typeId, archivedAt: null } })
      : await this.prisma.taskType.findUnique({ where: { code: SYSTEM_TASK_TYPE.code } });
    if (!type) throw new DomainException(ErrorCode.NOT_FOUND, 'Task type not found');
    const entry = await this.prisma.workflowSchemeEntry.findFirst({
      where: { taskTypeId: type.id, scheme: { isDefault: true } },
    });
    if (!entry) throw new DomainException(ErrorCode.NOT_FOUND, 'Workflow for task type not found');
    return { typeId: type.id, workflowId: entry.workflowId };
  }

  /** Личный маршрут сотрудника; нет — копия шаблона (своя транзакция ДО
   *  транзакции бизнес-операции: гонка двух копий упирается в частичный
   *  unique owner_id, проигравший дочитывает победителя). */
  async ensurePersonal(userId: string): Promise<string> {
    const found = await this.findPersonalId(userId);
    if (found) return found;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const template = await tx.workflow.findUniqueOrThrow({
          where: { code: PERSONAL_TEMPLATE_CODE },
          include: { stages: { where: { archivedAt: null }, orderBy: { sortOrder: 'asc' } } },
        });
        const created = await tx.workflow.create({
          data: { name: template.name, kind: 'personal', ownerId: userId },
        });
        await tx.workflowStage.createMany({
          data: template.stages.map((s) => ({
            workflowId: created.id,
            name: s.name,
            color: s.color,
            sortOrder: s.sortOrder,
            systemState: s.systemState,
            isInitial: s.isInitial,
          })),
        });
        return created.id;
      });
    } catch (error) {
      const winner = await this.findPersonalId(userId);
      if (winner) return winner;
      throw error;
    }
  }

  async findPersonalId(userId: string, tx?: TransactionClient): Promise<string | null> {
    const row = await (tx ?? this.prisma).workflow.findFirst({
      where: { kind: 'personal', ownerId: userId },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  /** Активные колонки личных маршрутов пользователей (для автоперемещения). */
  personalStagesOf(userIds: string[], tx: TransactionClient) {
    return tx.workflowStage.findMany({
      where: { archivedAt: null, workflow: { kind: 'personal', ownerId: { in: userIds } } },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: { workflow: { select: { ownerId: true } } },
    });
  }
}
