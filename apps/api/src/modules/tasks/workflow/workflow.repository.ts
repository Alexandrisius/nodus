import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import { ErrorCode, type TransitionDisplay } from '@nodus/contracts';
import { PERSONAL_TEMPLATE_CODE, STANDARD_TASK_TYPE } from '../catalog/system-catalog.js';
import { parseRules, type StageDef, type TransitionDef } from './transition-rules.js';

export interface StageRow extends StageDef {
  workflowId: string;
  color: string;
  sortOrder: number;
  isInitial: boolean;
  outcome: string | null;
}

export interface LoadedWorkflow {
  id: string;
  stages: StageRow[];
  transitions: TransitionDef[];
}

/**
 * Маршруты, типы и личные маршруты «Мой план» (ADR-0008/0020). Маршрут
 * задачи читается целиком (стадии + ЖИВЫЕ переходы с разобранными
 * правилами — архивные фильтруются до parseRules) — объём единицы-десятки
 * строк.
 */
@Injectable()
export class WorkflowRepository {
  constructor(private readonly prisma: PrismaService) {}

  async load(workflowId: string, tx?: TransactionClient): Promise<LoadedWorkflow> {
    const db = tx ?? this.prisma;
    const [stages, transitions] = await Promise.all([
      // Архивные стадии — только для истории (задачи/события ссылаются);
      // движку, редактору и копиям основ нужны ЖИВЫЕ (блокер ревью: призрак
      // архивной стадии возвращался на холст и воскрешался копией типа).
      db.workflowStage.findMany({
        where: { workflowId, archivedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      }),
      db.workflowTransition.findMany({ where: { workflowId, archivedAt: null } }),
    ]);
    return {
      id: workflowId,
      stages,
      transitions: transitions.map((t) => ({
        id: t.id,
        name: t.name,
        fromStageId: t.fromStageId,
        toStageId: t.toStageId,
        display: t.display as TransitionDisplay,
        sortOrder: t.sortOrder,
        rules: parseRules(t.rules),
      })),
    };
  }

  /** Блокировка строки маршрута на публикацию (optimistic concurrency). */
  async lockForUpdate(tx: TransactionClient, workflowId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM workflows WHERE id = ${workflowId} FOR UPDATE`;
  }

  /** Мета публикации маршрута (read редактора). kind — гвард редактора:
   *  публикуемый/читаемый маршрут обязан быть `task` (security #378 — чужие
   *  личные доски «Моего плана» и шаблон недоступны даже с правом). */
  async findMeta(
    workflowId: string,
    tx?: TransactionClient,
  ): Promise<{
    kind: string;
    version: number;
    publishedAt: Date | null;
    publishedById: string | null;
    layout: unknown;
  } | null> {
    return (tx ?? this.prisma).workflow.findUnique({
      where: { id: workflowId },
      select: { kind: true, version: true, publishedAt: true, publishedById: true, layout: true },
    });
  }

  /** Живая стадия по id (цель переноса, смена типа). */
  findStageById(stageId: string, tx?: TransactionClient) {
    return (tx ?? this.prisma).workflowStage.findUnique({ where: { id: stageId } });
  }

  /** Живые стадии маршрута по id маршрута (каталог статусов, смена типа). */
  findStages(workflowId: string, tx?: TransactionClient) {
    return (tx ?? this.prisma).workflowStage.findMany({
      where: { workflowId, archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  /** Типы, идущие по маршруту (payload публикации, read редактора). */
  async typeIdsOf(workflowId: string, tx?: TransactionClient): Promise<string[]> {
    const entries = await (tx ?? this.prisma).workflowSchemeEntry.findMany({
      where: { workflowId },
      select: { taskTypeId: true },
    });
    return entries.map((e) => e.taskTypeId);
  }

  /** Задачи стадии пачкой keyset (перенос публикации, идемпотентный повтор). */
  taskIdsOfStage(stageId: string, take: number, tx?: TransactionClient) {
    return (tx ?? this.prisma).task.findMany({
      where: { stageId },
      orderBy: { id: 'asc' },
      take,
      select: { id: true },
    });
  }

  /** Задачи стадии с чужим системным состоянием (смена этапа, пачка). */
  taskIdsToRestate(stageId: string, systemState: string, take: number, tx?: TransactionClient) {
    return (tx ?? this.prisma).task.findMany({
      where: { stageId, systemState: { not: systemState } },
      orderBy: { id: 'asc' },
      take,
      select: { id: true },
    });
  }

  /** Задачи по живым стадиям маршрута (для документа редактора). */
  async stageTaskCounts(
    workflowId: string,
    tx?: TransactionClient,
  ): Promise<Record<string, number>> {
    const db = tx ?? this.prisma;
    const stages = await db.workflowStage.findMany({
      where: { workflowId, archivedAt: null },
      select: { id: true },
    });
    if (stages.length === 0) return {};
    const rows = await db.task.groupBy({
      by: ['stageId'],
      where: { stageId: { in: stages.map((s) => s.id) } },
      _count: { _all: true },
    });
    const counts: Record<string, number> = {};
    for (const row of rows) {
      if (row.stageId) counts[row.stageId] = row._count._all;
    }
    return counts;
  }

  listTypes(archived: 'exclude' | 'include' = 'exclude') {
    return this.prisma.taskType.findMany({
      where: archived === 'include' ? {} : { archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    });
  }

  /** Тип (по умолчанию системный) и маршрут для него по схеме по умолчанию
   *  (задача без проекта; проектные схемы — ступень 3). `requireCreatable` —
   *  пути создания/смены типа: скрытый тип (`creatable=false`) сервер
   *  отвергает (гвард не только в UI, security #378). */
  async resolveTypeWorkflow(
    typeId?: string,
    opts: { requireCreatable?: boolean } = {},
  ): Promise<{ typeId: string; workflowId: string; structural: boolean }> {
    const type = typeId
      ? await this.prisma.taskType.findFirst({ where: { id: typeId, archivedAt: null } })
      : await this.prisma.taskType.findUnique({ where: { code: STANDARD_TASK_TYPE.code } });
    if (!type) throw new DomainException(ErrorCode.NOT_FOUND, 'Task type not found');
    if (opts.requireCreatable && !type.creatable) {
      throw new DomainException(ErrorCode.CONFLICT, 'Task type is not available for task creation');
    }
    const entry = await this.prisma.workflowSchemeEntry.findFirst({
      where: { taskTypeId: type.id, scheme: { isDefault: true } },
    });
    if (!entry) throw new DomainException(ErrorCode.NOT_FOUND, 'Workflow for task type not found');
    return { typeId: type.id, workflowId: entry.workflowId, structural: type.structural };
  }

  /** Живые типы с их маршрутами по схеме по умолчанию. */
  async typeWorkflowMap(): Promise<Map<string, string>> {
    const entries = await this.prisma.workflowSchemeEntry.findMany({
      where: { scheme: { isDefault: true }, taskType: { archivedAt: null } },
      select: { taskTypeId: true, workflowId: true },
    });
    return new Map(entries.map((e) => [e.taskTypeId, e.workflowId]));
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
            outcome: s.outcome,
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

  /** Активные стадии системного маршрута по коду каталога (порядок колонок). */
  async liveStagesByCode(code: string) {
    const workflow = await this.prisma.workflow.findUniqueOrThrow({ where: { code } });
    return this.prisma.workflowStage.findMany({
      where: { workflowId: workflow.id, archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  /** Активная колонка «Моего плана» именно этого сотрудника; чужая — null. */
  findPersonalColumn(ownerId: string, stageId: string, tx?: TransactionClient) {
    return (tx ?? this.prisma).workflowStage.findFirst({
      where: { id: stageId, archivedAt: null, workflow: { kind: 'personal', ownerId } },
    });
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
