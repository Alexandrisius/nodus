import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  TASK_EVENTS,
  type AuthUser,
  type PersonalStageCreateBody,
  type PersonalStageUpdateBody,
  type TaskStage,
  type TaskStageWithCount,
} from '@nodus/contracts';

import { PrismaService } from '../../../core/database/prisma.service.js';
import {
  TransactionRunner,
  type TransactionClient,
} from '../../../core/database/transaction-runner.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import { EventBus } from '../../../core/events/event-bus.js';
import { visibleTasksWhere } from '../access/task-visibility.js';
import { stageDto } from '../tasks/task-dto.mapper.js';
import { TasksQueryService } from '../tasks/tasks-query.service.js';
import { TasksRepository } from '../tasks/tasks.repository.js';
import { WorkflowRepository } from '../workflow/workflow.repository.js';

/**
 * Колонки «Моего плана» (ADR-0008): личный маршрут — личный инструмент,
 * правка прямо на доске. Последнюю колонку состояния удалить нельзя
 * (автоперемещению нужна цель, модель Linear); удаление = архивация (I15),
 * задачи колонки переезжают в первую колонку того же состояния.
 */
@Injectable()
export class PersonalStagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly txRunner: TransactionRunner,
    private readonly eventBus: EventBus,
    private readonly workflows: WorkflowRepository,
    private readonly repo: TasksRepository,
    private readonly query: TasksQueryService,
  ) {}

  private live(workflowId: string, tx?: TransactionClient) {
    return (tx ?? this.prisma).workflowStage.findMany({
      where: { workflowId, archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  async list(user: AuthUser): Promise<TaskStageWithCount[]> {
    const workflowId = await this.workflows.ensurePersonal(user.id);
    const viewer = await this.query.viewer(user);
    const [stages, counts] = await Promise.all([
      this.live(workflowId),
      this.repo.personalCounts(user.id, visibleTasksWhere(viewer, 'mine'), new Date()),
    ]);
    return stages.map((s, index) => ({
      ...stageDto({ ...s, sortOrder: index }),
      count: counts.all.find((c) => c.stageId === s.id)?._count._all ?? 0,
      overdueCount: counts.overdue.find((c) => c.stageId === s.id)?._count._all ?? 0,
    }));
  }

  async create(user: AuthUser, body: PersonalStageCreateBody): Promise<TaskStage> {
    const workflowId = await this.workflows.ensurePersonal(user.id);
    return this.txRunner.run(async (tx) => {
      const last = await tx.workflowStage.findFirst({
        where: { workflowId },
        orderBy: { sortOrder: 'desc' },
      });
      const stage = await tx.workflowStage.create({
        data: {
          workflowId,
          name: body.name,
          color: body.color,
          systemState: body.systemState,
          sortOrder: (last?.sortOrder ?? -1) + 1,
        },
      });
      await this.emit(tx, user.id, TASK_EVENTS.PERSONAL_STAGE_CREATED, stage.id);
      return stageDto(stage);
    });
  }

  async update(user: AuthUser, stageId: string, body: PersonalStageUpdateBody): Promise<TaskStage> {
    const workflowId = await this.workflows.ensurePersonal(user.id);
    return this.txRunner.run(async (tx) => {
      const stages = await this.live(workflowId, tx);
      const stage = stages.find((s) => s.id === stageId);
      if (!stage) throw DomainException.notFound('Stage not found');
      if (body.systemState && body.systemState !== stage.systemState) {
        this.assertNotLastOfState(stages, stage);
        // Колонка сменила состояние — её задачи остаются в состоянии своих задач:
        // переезжают в первую колонку прежнего состояния (размещение = проекция).
        await this.evacuate(tx, stages, stage);
      }
      if (body.order !== undefined) {
        const rest = stages.filter((s) => s.id !== stageId);
        rest.splice(Math.min(body.order, rest.length), 0, stage);
        for (const [i, s] of rest.entries()) {
          await tx.workflowStage.update({ where: { id: s.id }, data: { sortOrder: i } });
        }
      }
      const updated = await tx.workflowStage.update({
        where: { id: stageId },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.color !== undefined ? { color: body.color } : {}),
          ...(body.systemState !== undefined ? { systemState: body.systemState } : {}),
        },
      });
      await this.emit(tx, user.id, TASK_EVENTS.PERSONAL_STAGE_UPDATED, stageId);
      return stageDto(updated);
    });
  }

  async archive(user: AuthUser, stageId: string): Promise<{ ok: true; movedToStageId?: string }> {
    const workflowId = await this.workflows.ensurePersonal(user.id);
    return this.txRunner.run(async (tx) => {
      const stages = await this.live(workflowId, tx);
      const stage = stages.find((s) => s.id === stageId);
      if (!stage) throw DomainException.notFound('Stage not found');
      this.assertNotLastOfState(stages, stage);
      const movedTo = await this.evacuate(tx, stages, stage);
      await tx.workflowStage.update({ where: { id: stageId }, data: { archivedAt: new Date() } });
      await this.emit(tx, user.id, TASK_EVENTS.PERSONAL_STAGE_ARCHIVED, stageId);
      return { ok: true, movedToStageId: movedTo };
    });
  }

  private assertNotLastOfState(
    stages: { id: string; systemState: string }[],
    stage: { id: string; systemState: string },
  ) {
    if (!stages.some((s) => s.id !== stage.id && s.systemState === stage.systemState)) {
      throw new DomainException(
        ErrorCode.TASK_LAST_STAGE,
        'Last column of the state cannot be removed',
      );
    }
  }

  private async evacuate(
    tx: TransactionClient,
    stages: { id: string; systemState: string }[],
    stage: { id: string; systemState: string },
  ): Promise<string | undefined> {
    const target = stages.find((s) => s.id !== stage.id && s.systemState === stage.systemState);
    if (!target) return undefined;
    await tx.taskPersonalPlacement.updateMany({
      where: { stageId: stage.id },
      data: { stageId: target.id },
    });
    return target.id;
  }

  private emit(tx: TransactionClient, userId: string, type: string, stageId: string) {
    return this.eventBus.emit(
      tx,
      type,
      { stageId, audience: [userId] },
      { actorId: userId, aggregateType: 'workflow_stage', aggregateId: stageId },
    );
  }
}
