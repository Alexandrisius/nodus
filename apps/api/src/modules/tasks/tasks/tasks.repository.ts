import { Injectable } from '@nestjs/common';
import { statesOfPhase } from '@nodus/contracts';

import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../core/database/prisma.service.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import type { WorkflowGateFacts } from '../../../core/ports/workflow-entity.port.js';
import { keyBetween } from '../lib/fractional-index.js';
import { taskListInclude } from './task-row.js';

/** Параллельное «В задачу» по тому же сообщению проиграло частичному unique
 *  `tasks_source_dedup_key` (P2002): победитель уже создал задачу — сервис
 *  дочитывает её вне упавшей транзакции. */
export class DuplicateTaskSourceError extends Error {
  constructor() {
    super('Task for this source already exists');
    this.name = 'DuplicateTaskSourceError';
  }
}

/** Поля новой задачи (участники — вложенным созданием в том же INSERT). */
export interface NewTaskData {
  title: string;
  description: string;
  typeId: string;
  workflowId: string;
  stageId: string;
  systemState: string;
  stageOrder: string;
  priority: string;
  deadline: Date | null;
  plannedMinutes: number | null;
  acceptRequired: boolean;
  creatorId: string;
  assigneeId: string;
  parentId: string | null;
  projectId: string | null;
  source: string;
  sourceId: string | null;
  checklistTotal: number;
  participants: { userId: string; role: string; muted: boolean }[];
}

/** Правка полей задачи (PATCH): только переданные ключи. */
export interface TaskFieldsPatch {
  title?: string;
  description?: string;
  priority?: string;
  plannedMinutes?: number | null;
  acceptRequired?: boolean;
  parentId?: string | null;
  deadline?: Date | null;
  overdueNotifiedAt?: null;
  assigneeId?: string;
}

/** Смена стадии задачи (переход маршрута; проверки — у вызывающего). */
export interface TaskStageMove {
  stageId: string;
  systemState: string;
  stageOrder: string;
  stateChangedAt?: Date;
  completedAt: Date | null;
}

/**
 * Таблица `tasks`: записи, блокировки и чтения внутри транзакций сервисов
 * (чтения фидов/детали/ветки — TasksQueryRepository). Файл длиннее 200
 * строк осознанно: единая точка доступа к строке задачи (локи, денормализации
 * spent/checklist/comments, мягкое удаление) — дробление развело бы инварианты
 * одной строки по файлам.
 */
@Injectable()
export class TasksRepository {
  constructor(private readonly prisma: PrismaService) {}

  findOne(where: Prisma.TaskWhereInput, viewerId: string, tx?: TransactionClient) {
    return (tx ?? this.prisma).task.findFirst({ where, include: taskListInclude(viewerId) });
  }

  /** Строка задачи в форме DTO списка (после записи — внутри или вне tx). */
  findListRow(id: string, viewerId: string, tx?: TransactionClient) {
    return (tx ?? this.prisma).task.findUniqueOrThrow({
      where: { id },
      include: taskListInclude(viewerId),
    });
  }

  /** Задача с участниками (роли актора, аудитория событий, держатели плана). */
  findWithParticipants(id: string, tx: TransactionClient) {
    return tx.task.findUniqueOrThrow({ where: { id }, include: { participants: true } });
  }

  /** Живая задача с составом (для событий по чужому триггеру); удалённая — null. */
  findLiveRoster(id: string, tx: TransactionClient) {
    return tx.task.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, number: true, creatorId: true, assigneeId: true, participants: true },
    });
  }

  /** Блокировка строки задачи на время транзакции (сериализация переходов). */
  async lock(tx: TransactionClient, taskId: string): Promise<void> {
    await tx.$executeRaw`SELECT 1 FROM tasks WHERE id = ${taskId}::uuid FOR UPDATE`;
  }

  /** Дедуп «В задачу»: живая задача постановщика по сообщению чата. */
  async findLiveIdBySource(creatorId: string, messageId: string): Promise<string | null> {
    const found = await this.prisma.task.findFirst({
      where: { source: 'chat_message', sourceId: messageId, creatorId, deletedAt: null },
      select: { id: true },
    });
    return found?.id ?? null;
  }

  async create(data: NewTaskData, tx: TransactionClient) {
    const { participants, ...task } = data;
    try {
      return await tx.task.create({ data: { ...task, participants: { create: participants } } });
    } catch (error) {
      if (task.sourceId && (error as { code?: string }).code === 'P2002') {
        throw new DuplicateTaskSourceError();
      }
      throw error;
    }
  }

  async updateFields(tx: TransactionClient, id: string, patch: TaskFieldsPatch): Promise<void> {
    await tx.task.update({ where: { id }, data: patch });
  }

  /** Текущий родитель (свежий, под блокировкой вызывающего). */
  async parentIdOf(tx: TransactionClient, id: string): Promise<string | null> {
    const row = await tx.task.findUniqueOrThrow({ where: { id }, select: { parentId: true } });
    return row.parentId;
  }

  async stageIdOf(tx: TransactionClient, id: string): Promise<string> {
    const row = await tx.task.findUniqueOrThrow({ where: { id }, select: { stageId: true } });
    return row.stageId;
  }

  async systemStateOf(tx: TransactionClient, id: string): Promise<string> {
    const row = await tx.task.findUniqueOrThrow({ where: { id }, select: { systemState: true } });
    return row.systemState;
  }

  async numberOf(tx: TransactionClient, id: string): Promise<number> {
    const row = await tx.task.findUniqueOrThrow({ where: { id }, select: { number: true } });
    return row.number;
  }

  /** Задачи стадии пачкой keyset (перенос публикации, идемпотентный повтор). */
  idsByStage(stageId: string, take: number) {
    return this.prisma.task.findMany({
      where: { stageId },
      orderBy: { id: 'asc' },
      take,
      select: { id: true },
    });
  }

  /** Задачи стадии с чужим системным состоянием (смена группы, пачка). */
  idsToRestate(stageId: string, systemState: string, take: number) {
    return this.prisma.task.findMany({
      where: { stageId, systemState: { not: systemState } },
      orderBy: { id: 'asc' },
      take,
      select: { id: true },
    });
  }

  /** Счётчики задач по стадиям (диалог публикации, мета списка типов). */
  async countByStages(
    stageIds: readonly string[],
    tx?: TransactionClient,
  ): Promise<{ stageId: string; count: number }[]> {
    const rows = await (tx ?? this.prisma).task.groupBy({
      by: ['stageId'],
      where: { stageId: { in: [...stageIds] } },
      _count: { _all: true },
    });
    return rows.map((row) => ({ stageId: row.stageId, count: row._count._all }));
  }

  async setStageOrder(tx: TransactionClient, id: string, stageOrder: string): Promise<void> {
    await tx.task.update({ where: { id }, data: { stageOrder } });
  }

  async moveToStage(tx: TransactionClient, id: string, move: TaskStageMove): Promise<void> {
    await tx.task.update({ where: { id }, data: move });
  }

  /** Смена типа задачи и её маршрута (#378; стадия — отдельно StageMover). */
  async setType(
    tx: TransactionClient,
    id: string,
    type: { typeId: string; workflowId: string },
  ): Promise<void> {
    await tx.task.update({ where: { id }, data: type });
  }

  /** Пересчёт состояния без смены стадии (стадия сменила группу, #378). */
  async setState(
    tx: TransactionClient,
    id: string,
    state: Omit<TaskStageMove, 'stageId' | 'stageOrder'>,
  ): Promise<void> {
    await tx.task.update({ where: { id }, data: state });
  }

  /** Отметка «задача изменилась» (updatedAt) без правки полей. */
  async touch(tx: TransactionClient, id: string): Promise<void> {
    await tx.task.update({ where: { id }, data: { updatedAt: new Date() } });
  }

  async setCommentsCount(tx: TransactionClient, id: string, commentsCount: number): Promise<void> {
    await tx.task.update({ where: { id }, data: { commentsCount } });
  }

  async softDelete(tx: TransactionClient, id: string, at: Date): Promise<void> {
    await tx.task.update({ where: { id }, data: { deletedAt: at } });
  }

  async reparentChildren(
    tx: TransactionClient,
    parentId: string,
    newParentId: string | null,
  ): Promise<void> {
    await tx.task.updateMany({ where: { parentId }, data: { parentId: newParentId } });
  }

  /** Ближайший ЖИВОЙ предок задачи (мягко удалённые звенья пропускаются);
   *  нет — null. Глубина-предохранитель от испорченного дерева. */
  async liveAncestorId(tx: TransactionClient, taskId: string): Promise<string | null> {
    const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      WITH RECURSIVE up AS (
        SELECT p.id, p.parent_id, p.deleted_at, 1 AS depth
          FROM tasks t JOIN tasks p ON p.id = t.parent_id WHERE t.id = ${taskId}::uuid
        UNION ALL
        SELECT p.id, p.parent_id, p.deleted_at, up.depth + 1
          FROM tasks p JOIN up ON p.id = up.parent_id
          WHERE up.deleted_at IS NOT NULL AND up.depth < 1000
      ) SELECT id FROM up WHERE deleted_at IS NULL ORDER BY depth LIMIT 1`);
    return rows[0]?.id ?? null;
  }

  /** Просроченные живые задачи фазы open без уведомления (частичный индекс
   *  tasks_overdue_scan_idx), старейший срок первым. Сданная работа
   *  («Утверждение») и итог не просрочены (ADR-0020, дополнение 2). */
  findOverdueToNotify(tx: TransactionClient, now: Date, limit: number) {
    return tx.task.findMany({
      where: {
        deletedAt: null,
        overdueNotifiedAt: null,
        deadline: { lt: now },
        systemState: { in: statesOfPhase('open') },
      },
      include: { participants: true },
      orderBy: { deadline: 'asc' },
      take: limit,
    });
  }

  async markOverdueNotified(tx: TransactionClient, id: string, at: Date): Promise<void> {
    await tx.task.update({ where: { id }, data: { overdueNotifiedAt: at } });
  }

  async gateFacts(taskId: string, tx: TransactionClient): Promise<WorkflowGateFacts> {
    const children = (phase: 'open' | 'review') =>
      tx.task.count({
        where: { parentId: taskId, deletedAt: null, systemState: { in: statesOfPhase(phase) } },
      });
    const [task, openSubtasks, reviewSubtasks, result] = await Promise.all([
      tx.task.findUniqueOrThrow({ where: { id: taskId } }),
      children('open'),
      children('review'),
      tx.taskResult.findFirst({
        where: { taskId },
        orderBy: { createdAt: 'desc' },
        select: { text: true },
      }),
    ]);
    return {
      stageId: task.stageId,
      acceptRequired: task.acceptRequired,
      creatorIsAssignee: task.creatorId === task.assigneeId,
      openSubtasks,
      reviewSubtasks,
      checklistDone: task.checklistDone,
      checklistTotal: task.checklistTotal,
      spentMinutes: task.spentMinutes,
      description: task.description,
      deadline: task.deadline,
      assigneeId: task.assigneeId,
      plannedMinutes: task.plannedMinutes,
      hasResult: Boolean(result?.text.trim()),
    };
  }

  /** Ключ порядка для позиции index в колонке глобальной оси (без самой задачи). */
  async stageKeyAt(
    tx: TransactionClient,
    stageId: string,
    index: number | undefined,
    exceptId?: string,
  ) {
    const where = { stageId, ...(exceptId ? { id: { not: exceptId } } : {}) };
    if (index === undefined || index === 0) {
      const first = await tx.task.findFirst({
        where,
        orderBy: [{ stageOrder: 'asc' }, { id: 'asc' }],
      });
      return keyBetween(null, first?.stageOrder ?? null);
    }
    const near = await tx.task.findMany({
      where,
      orderBy: [{ stageOrder: 'asc' }, { id: 'asc' }],
      skip: index - 1,
      take: 2,
      select: { stageOrder: true },
    });
    return keyBetween(near[0]?.stageOrder ?? null, near[1]?.stageOrder ?? null);
  }

  /** Глобальная очередь смен родителя (pg_advisory_xact_lock до конца tx). */
  async lockTree(tx: TransactionClient): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('nodus:tasks:tree'))`;
  }

  /** Предок ли candidate задачи taskId (защита от цикла родителя). */
  async isDescendant(
    tx: TransactionClient,
    ancestorId: string,
    candidateId: string,
  ): Promise<boolean> {
    const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      WITH RECURSIVE sub AS (
        SELECT id FROM tasks WHERE parent_id = ${ancestorId}::uuid
        UNION SELECT t.id FROM tasks t JOIN sub ON t.parent_id = sub.id
      ) SELECT id FROM sub WHERE id = ${candidateId}::uuid LIMIT 1`);
    return rows.length > 0;
  }
}
