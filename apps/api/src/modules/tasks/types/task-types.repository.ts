import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';

import { PrismaService } from '../../../core/database/prisma.service.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import { parseRules } from '../workflow/transition-rules.js';
import type { LoadedWorkflow } from '../workflow/workflow.repository.js';

/**
 * Библиотека типов задач (#378): CRUD типов и копирование маршрутов-основ.
 * Код типов из редактора генерирует сервер (`custom-<8 символов>`); копия
 * маршрута получает НОВЫЕ id стадий/переходов (цели route_if перемапливаются),
 * version 1 и считается опубликованной.
 */
@Injectable()
export class TaskTypesRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(archived: 'exclude' | 'include' | 'only') {
    return this.prisma.taskType.findMany({
      where:
        archived === 'include'
          ? {}
          : archived === 'only'
            ? { archivedAt: { not: null } }
            : { archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    });
  }

  /** Живой тип по id (смена типа задачи). */
  findLiveById(id: string) {
    return this.prisma.taskType.findFirst({ where: { id, archivedAt: null } });
  }

  findLiveByName(name: string, exceptId?: string) {
    return this.prisma.taskType.findFirst({
      where: { name, archivedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
  }

  async maxSortOrder(): Promise<number> {
    const last = await this.prisma.taskType.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return (last?.sortOrder ?? -1) + 1;
  }

  async workflowIdOf(typeId: string): Promise<string> {
    const entry = await this.prisma.workflowSchemeEntry.findFirst({
      where: { taskTypeId: typeId, scheme: { isDefault: true } },
      select: { workflowId: true },
    });
    if (!entry) throw DomainException.notFound('Workflow for task type not found');
    return entry.workflowId;
  }

  /** workflowId по каждому живому типу (для списка). */
  async workflowMap(): Promise<Map<string, string>> {
    const entries = await this.prisma.workflowSchemeEntry.findMany({
      where: { scheme: { isDefault: true } },
      select: { taskTypeId: true, workflowId: true },
    });
    return new Map(entries.map((e) => [e.taskTypeId, e.workflowId]));
  }

  /** Копия маршрута-основы: новые id, каталог-кодов нет, route_if цели
   *  перемапливаются на новые стадии. Возвращает id нового маршрута. */
  async copyWorkflow(
    tx: TransactionClient,
    source: LoadedWorkflow,
    def: {
      name: string;
      publishedById: string;
      code?: string;
      publishedAt?: Date | null;
    },
  ): Promise<string> {
    const created = await tx.workflow.create({
      data: {
        code: def.code ?? null,
        name: def.name,
        kind: 'task',
        version: 1,
        publishedAt: def.publishedAt ?? new Date(),
        publishedById: def.publishedById,
        customizedAt: new Date(),
      },
    });
    const idMap = new Map<string, string>();
    for (const stage of source.stages) {
      const copy = await tx.workflowStage.create({
        data: {
          workflowId: created.id,
          code: null,
          name: stage.name,
          color: stage.color,
          sortOrder: stage.sortOrder,
          systemState: stage.systemState,
          outcome: stage.outcome,
          isInitial: stage.isInitial,
        },
      });
      idMap.set(stage.id, copy.id);
    }
    for (const transition of source.transitions) {
      const rules = parseRules(transition.rules);
      const postFunctions = rules.postFunctions.map((pf) =>
        pf.kind === 'route_if' ? { ...pf, toStageId: idMap.get(pf.toStageId) ?? pf.toStageId } : pf,
      );
      await tx.workflowTransition.create({
        data: {
          workflowId: created.id,
          code: null,
          name: transition.name,
          fromStageId: transition.fromStageId ? (idMap.get(transition.fromStageId) ?? null) : null,
          toStageId: idMap.get(transition.toStageId) ?? transition.toStageId,
          display: transition.display,
          sortOrder: transition.sortOrder,
          rules: { ...rules, postFunctions } as Prisma.InputJsonValue,
        },
      });
    }
    return created.id;
  }

  async attachToDefaultScheme(tx: TransactionClient, typeId: string, workflowId: string) {
    const scheme = await tx.workflowScheme.findFirstOrThrow({ where: { isDefault: true } });
    await tx.workflowSchemeEntry.upsert({
      where: { schemeId_taskTypeId: { schemeId: scheme.id, taskTypeId: typeId } },
      update: { workflowId },
      create: { schemeId: scheme.id, taskTypeId: typeId, workflowId },
    });
  }

  /** Простой маршрут-основа «Ожидает → В работе → Завершена». */
  createSimpleWorkflow(tx: TransactionClient, def: { name: string; publishedById: string }) {
    return this.copyWorkflow(tx, SIMPLE_WORKFLOW, def);
  }
}

/** Минимальный маршрут «в памяти» для основы simple. */
const SIMPLE_WORKFLOW: LoadedWorkflow = {
  id: 'simple',
  stages: [
    {
      id: 's-new',
      code: null,
      name: 'Ожидает',
      systemState: 'backlog',
      archivedAt: null,
      workflowId: 'simple',
      color: 'neutral',
      sortOrder: 0,
      isInitial: true,
      outcome: null,
    },
    {
      id: 's-wip',
      code: null,
      name: 'В работе',
      systemState: 'active',
      archivedAt: null,
      workflowId: 'simple',
      color: 'success',
      sortOrder: 1,
      isInitial: false,
      outcome: null,
    },
    {
      id: 's-done',
      code: null,
      name: 'Завершена',
      systemState: 'closed',
      archivedAt: null,
      workflowId: 'simple',
      color: 'info',
      sortOrder: 2,
      isInitial: false,
      outcome: 'success',
    },
  ],
  transitions: [
    {
      id: 't-start',
      name: 'Взять в работу',
      fromStageId: 's-new',
      toStageId: 's-wip',
      display: 'primary',
      sortOrder: 0,
      rules: parseRules({ conditions: [{ kind: 'role_in', roles: ['assignee', 'coexecutor'] }] }),
    },
    {
      id: 't-complete',
      name: 'Завершить',
      fromStageId: 's-wip',
      toStageId: 's-done',
      display: 'primary',
      sortOrder: 1,
      rules: parseRules({
        conditions: [{ kind: 'role_in', roles: ['assignee'] }],
        validators: [{ kind: 'no_open_subtasks' }],
      }),
    },
  ],
};
