import { Injectable } from '@nestjs/common';
import type { WorkflowTransitionRules } from '@nodus/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';

const OPEN_STATES = ['backlog', 'active', 'paused'];

export interface CatalogStageData {
  name: string;
  color: string;
  sortOrder: number;
  systemState: string;
  outcome: string | null;
  isInitial: boolean;
}

export interface CatalogTransitionData {
  name: string;
  fromStageId: string | null;
  toStageId: string;
  display: string;
  sortOrder: number;
  rules: WorkflowTransitionRules;
}

/** Правила перехода — JSONB (разобраны parseRules — закрытый реестр contracts). */
function json(data: CatalogTransitionData) {
  return { ...data, rules: data.rules as Prisma.InputJsonValue };
}

/**
 * Системный каталог маршрутов (ADR-0020/0021): записи по `code` — типы,
 * схема, маршруты, стадии, переходы. Только для бутстрапа (CatalogBootstrap),
 * всё внутри его транзакции; применение — «засев один раз» по ревизии.
 */
@Injectable()
export class CatalogRepository {
  async ensureType(
    tx: TransactionClient,
    def: {
      code: string;
      name: string;
      icon: string;
      color: string;
      description: string;
    },
  ) {
    return (
      (await tx.taskType.findUnique({ where: { code: def.code } })) ??
      (await tx.taskType.create({
        data: { ...def, isSystem: true, catalogRevision: 2 },
      }))
    );
  }

  async ensureDefaultScheme(tx: TransactionClient, def: { code: string; name: string }) {
    return (
      (await tx.workflowScheme.findUnique({ where: { code: def.code } })) ??
      (await tx.workflowScheme.create({ data: { ...def, isDefault: true } }))
    );
  }

  /** Привязка «тип → маршрут» в схеме (существующая не перезаписывается). */
  async ensureSchemeEntry(
    tx: TransactionClient,
    schemeId: string,
    taskTypeId: string,
    workflowId: string,
  ): Promise<void> {
    await tx.workflowSchemeEntry.upsert({
      where: { schemeId_taskTypeId: { schemeId, taskTypeId } },
      update: {},
      create: { schemeId, taskTypeId, workflowId },
    });
  }

  async ensureWorkflow(
    tx: TransactionClient,
    def: { code: string; name: string; kind: string; isTemplate: boolean },
  ) {
    return (
      (await tx.workflow.findUnique({ where: { code: def.code } })) ??
      (await tx.workflow.create({
        data: { ...def, isSystem: true, catalogRevision: 2 },
      }))
    );
  }

  findStage(tx: TransactionClient, workflowId: string, code: string) {
    return tx.workflowStage.findUnique({ where: { workflowId_code: { workflowId, code } } });
  }

  createStage(tx: TransactionClient, workflowId: string, code: string, data: CatalogStageData) {
    return tx.workflowStage.create({ data: { workflowId, code, ...data } });
  }

  async updateStage(
    tx: TransactionClient,
    stageId: string,
    data: Partial<CatalogStageData>,
  ): Promise<void> {
    await tx.workflowStage.update({ where: { id: stageId }, data });
  }

  /** Стадия сменила системное состояние — денормализация задач в ней
   *  (`tasks.system_state` + completedAt по канону applyStage: закрытое
   *  состояние — момент завершения, открытое — сброс). Число задач. */
  async restateStageTasks(
    tx: TransactionClient,
    stageId: string,
    systemState: string,
    now: Date,
  ): Promise<number> {
    const { count } = await tx.task.updateMany({
      where: { stageId, systemState: { not: systemState } },
      data: { systemState, stateChangedAt: now },
    });
    if (OPEN_STATES.includes(systemState)) {
      await tx.task.updateMany({
        where: { stageId, completedAt: { not: null } },
        data: { completedAt: null },
      });
    } else {
      await tx.task.updateMany({
        where: { stageId, completedAt: null },
        data: { completedAt: now },
      });
    }
    return count;
  }

  findTransition(tx: TransactionClient, workflowId: string, code: string) {
    return tx.workflowTransition.findUnique({ where: { workflowId_code: { workflowId, code } } });
  }

  /** Живые переходы маршрута (для архивации неcatalogочных при посеве). */
  liveTransitions(tx: TransactionClient, workflowId: string) {
    return tx.workflowTransition.findMany({
      where: { workflowId, archivedAt: null },
      select: { id: true, code: true },
    });
  }

  async createTransition(
    tx: TransactionClient,
    workflowId: string,
    code: string,
    data: CatalogTransitionData,
  ): Promise<void> {
    await tx.workflowTransition.create({ data: { workflowId, code, ...json(data) } });
  }

  async updateTransition(
    tx: TransactionClient,
    transitionId: string,
    data: CatalogTransitionData,
  ): Promise<void> {
    await tx.workflowTransition.update({
      where: { id: transitionId },
      data: { ...json(data), archivedAt: null },
    });
  }

  async archiveTransition(tx: TransactionClient, transitionId: string, now: Date): Promise<void> {
    await tx.workflowTransition.update({
      where: { id: transitionId },
      data: { archivedAt: now },
    });
  }
}
