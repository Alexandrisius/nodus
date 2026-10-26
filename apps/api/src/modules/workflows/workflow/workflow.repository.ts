import { Injectable } from '@nestjs/common';

import type { ProcessCategory, TransitionDisplay } from '@nodus/contracts';
import { PrismaService } from '../../../core/database/prisma.service.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import { parseRules, type StageDef, type TransitionDef } from './transition-rules.js';
import { parseForm } from './transition-form.js';

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
 * Маршруты «Процессов» (ADR-0020/0021/0024): стадии, переходы, схема
 * «тип → маршрут», мета публикации. Маршрут читается целиком (стадии + ЖИВЫЕ
 * переходы с разобранными правилами — архивные фильтруются до parseRules):
 * объём единицы-десятки строк. Личные маршруты «Моего плана» сюда не входят —
 * это временное исключение модуля задач до #438/#439.
 */
@Injectable()
export class WorkflowRepository {
  constructor(private readonly prisma: PrismaService) {}

  async load(workflowId: string, tx?: TransactionClient): Promise<LoadedWorkflow> {
    const db = tx ?? this.prisma;
    const [stages, transitions] = await Promise.all([
      // Архивные стадии — только для истории (сущности/события ссылаются);
      // движку, редактору и копиям основ нужны ЖИВЫЕ (блокер ревью: призрак
      // архивной стадии возвращался на холст и воскресал копией типа).
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
        form: parseForm(t.form),
      })),
    };
  }

  /** Блокировка строки маршрута на публикацию (optimistic concurrency). */
  async lockForUpdate(tx: TransactionClient, workflowId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM workflows WHERE id = ${workflowId} FOR UPDATE`;
  }

  /** Мета публикации маршрута (read редактора). kind — гвард редактора:
   *  публикуемый/читаемый маршрут обязан быть маршрутом типа, а не личной
   *  доской «Моего плана» или шаблоном (security #378 — чужие личные доски
   *  недоступны даже с правом). */
  async findMeta(
    workflowId: string,
    tx?: TransactionClient,
  ): Promise<{
    kind: string;
    version: number;
    publishedAt: Date | null;
    publishedById: string | null;
    layout: unknown;
    creation: unknown;
  } | null> {
    return (tx ?? this.prisma).workflow.findUnique({
      where: { id: workflowId },
      select: {
        kind: true,
        version: true,
        publishedAt: true,
        publishedById: true,
        layout: true,
        creation: true,
      },
    });
  }

  /** Живая стадия по id (цель переноса, смена типа). */
  findStageById(stageId: string, tx?: TransactionClient) {
    return (tx ?? this.prisma).workflowStage.findUnique({ where: { id: stageId } });
  }

  /** Стадии по id пачкой, включая архивные (гидратация DTO истории). */
  stagesByIds(ids: readonly string[], tx?: TransactionClient) {
    if (ids.length === 0) return Promise.resolve([]);
    return (tx ?? this.prisma).workflowStage.findMany({
      where: { id: { in: [...ids] } },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
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
      select: { processTypeId: true },
    });
    return entries.map((e) => e.processTypeId);
  }

  /** Опубликованная форма создания маршрута (#432) — копия типа её несёт. */
  async creationOf(workflowId: string, tx?: TransactionClient): Promise<unknown> {
    const row = await (tx ?? this.prisma).workflow.findUnique({
      where: { id: workflowId },
      select: { creation: true },
    });
    return row?.creation ?? null;
  }

  /** Категория сущностей маршрута — по его типам (все типы маршрута одной
   *  категории: тип создаётся вместе с маршрутом). Маршрут без типов
   *  (сирота) считается задачным — поведение до переноса. */
  async categoryOf(workflowId: string, tx?: TransactionClient): Promise<ProcessCategory> {
    const entry = await (tx ?? this.prisma).workflowSchemeEntry.findFirst({
      where: { workflowId },
      orderBy: { processTypeId: 'asc' },
      select: { processType: { select: { category: true } } },
    });
    return (entry?.processType.category as ProcessCategory | undefined) ?? 'task';
  }
}
