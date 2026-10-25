import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../core/database/prisma.service.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import {
  PERSONAL_TEMPLATE,
  PERSONAL_TEMPLATE_CODE,
  PERSONAL_TEMPLATE_REVISION,
  type PersonalTemplateStage,
} from './personal-template.js';

/** CHECK `(system_state='closed') = (outcome IS NOT NULL)` (#378): колонка
 *  «Итога» в «Моём плане» — всегда «выполнена» (отмена — свойство маршрута). */
const outcomeOf = (systemState: string): 'success' | null =>
  systemState === 'closed' ? 'success' : null;

/**
 * Личные маршруты «Мой план» (`workflows` kind=personal + их `workflow_stages`,
 * ADR-0008) — ЯВНОЕ ВРЕМЕННОЕ ИСКЛЮЧЕНИЕ ADR-0024: таблицы принадлежат
 * модулю «Процессы», но личные доски остаются данными задач до #438/#439
 * (снимаются вместе с «Моим планом»). Читает и пишет их только этот
 * репозиторий; движок «Процессов» такие маршруты не трогает (редактор
 * отдаёт на них 404). Создание доски — ensurePersonal, засев шаблона —
 * PersonalTemplateBootstrap.
 */
@Injectable()
export class PersonalBoardsRepository {
  constructor(private readonly prisma: PrismaService) {}

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

  /** Активная колонка «Моего плана» именно этого сотрудника; чужая — null. */
  findColumn(ownerId: string, stageId: string, tx?: TransactionClient) {
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

  /** Засев шаблона «засев один раз»: создаёт маршрут-шаблон и его колонки,
   *  пока шаблон не правили руками и ревизия меньше текущей. */
  async seedTemplate(tx: TransactionClient): Promise<void> {
    const workflow =
      (await tx.workflow.findUnique({ where: { code: PERSONAL_TEMPLATE.code } })) ??
      (await tx.workflow.create({
        data: {
          code: PERSONAL_TEMPLATE.code,
          name: PERSONAL_TEMPLATE.name,
          kind: 'personal',
          isTemplate: true,
          isSystem: true,
          catalogRevision: 0,
        },
      }));
    await tx.$queryRaw`SELECT id FROM workflows WHERE id = ${workflow.id}::uuid FOR UPDATE`;
    const state = await tx.workflow.findUniqueOrThrow({
      where: { id: workflow.id },
      select: { customizedAt: true, catalogRevision: true },
    });
    if (state.customizedAt !== null || state.catalogRevision >= PERSONAL_TEMPLATE_REVISION) {
      return;
    }
    for (const [index, stage] of PERSONAL_TEMPLATE.stages.entries()) {
      await this.seedTemplateStage(tx, workflow.id, stage, index);
    }
    await tx.workflow.update({
      where: { id: workflow.id },
      data: { catalogRevision: PERSONAL_TEMPLATE_REVISION },
    });
  }

  private async seedTemplateStage(
    tx: TransactionClient,
    workflowId: string,
    stage: PersonalTemplateStage,
    index: number,
  ): Promise<void> {
    const want = {
      name: stage.name,
      color: stage.color,
      sortOrder: index,
      systemState: stage.systemState,
      outcome: stage.outcome ?? null,
      isInitial: stage.isInitial ?? false,
    };
    const found = await tx.workflowStage.findUnique({
      where: { workflowId_code: { workflowId, code: stage.code } },
    });
    if (!found) {
      await tx.workflowStage.create({ data: { workflowId, code: stage.code, ...want } });
      return;
    }
    await tx.workflowStage.update({ where: { id: found.id }, data: want });
  }

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
