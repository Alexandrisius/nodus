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

import {
  TransactionRunner,
  type TransactionClient,
} from '../../../core/database/transaction-runner.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import { EventBus } from '../../../core/events/event-bus.js';
import { visibleTasksWhere } from '../access/task-visibility.js';
import { stageDto } from '../tasks/task-dto.mapper.js';
import { TasksQueryService } from '../tasks/tasks-query.service.js';
import { TasksQueryRepository } from '../tasks/tasks-query.repository.js';
import { WorkflowRepository } from '../workflow/workflow.repository.js';
import { PersonalStagesRepository } from './personal-stages.repository.js';
import { PlacementsRepository } from './placements.repository.js';

/** Потолок колонок личной доски (анти-DoS, находка security-гейта #37). */
const MAX_PERSONAL_STAGES = 30;

/**
 * Колонки «Моего плана» (ADR-0008): личный маршрут — личный инструмент,
 * правка прямо на доске. Последнюю колонку состояния удалить нельзя
 * (автоперемещению нужна цель, модель Linear); удаление = архивация (I15),
 * задачи колонки переезжают в первую колонку того же состояния. Мутации
 * одной доски сериализуются advisory-локом владельца (проверки «последняя
 * колонка» и лимит — по снимку внутри tx).
 */
@Injectable()
export class PersonalStagesService {
  constructor(
    private readonly txRunner: TransactionRunner,
    private readonly eventBus: EventBus,
    private readonly workflows: WorkflowRepository,
    private readonly stagesRepo: PersonalStagesRepository,
    private readonly placementsRepo: PlacementsRepository,
    private readonly queryRepo: TasksQueryRepository,
    private readonly query: TasksQueryService,
  ) {}

  async list(user: AuthUser): Promise<TaskStageWithCount[]> {
    const workflowId = await this.workflows.ensurePersonal(user.id);
    const viewer = await this.query.viewer(user);
    const [stages, counts] = await Promise.all([
      this.stagesRepo.liveStages(workflowId),
      this.queryRepo.personalCounts(user.id, visibleTasksWhere(viewer, 'mine'), new Date()),
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
      await this.stagesRepo.lockBoard(user.id, tx);
      const total = await this.stagesRepo.countLive(workflowId, tx);
      if (total >= MAX_PERSONAL_STAGES) {
        throw DomainException.conflict(
          `Personal board is limited to ${MAX_PERSONAL_STAGES} columns`,
        );
      }
      const stage = await this.stagesRepo.create(tx, {
        workflowId,
        name: body.name,
        color: body.color,
        systemState: body.systemState,
        sortOrder: await this.stagesRepo.nextSortOrder(workflowId, tx),
      });
      await this.emit(tx, user.id, TASK_EVENTS.PERSONAL_STAGE_CREATED, stage.id);
      return stageDto(stage);
    });
  }

  async update(user: AuthUser, stageId: string, body: PersonalStageUpdateBody): Promise<TaskStage> {
    const workflowId = await this.workflows.ensurePersonal(user.id);
    return this.txRunner.run(async (tx) => {
      await this.stagesRepo.lockBoard(user.id, tx);
      const stages = await this.stagesRepo.liveStages(workflowId, tx);
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
          await this.stagesRepo.setSortOrder(tx, s.id, i);
        }
      }
      const updated = await this.stagesRepo.update(tx, stageId, {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.color !== undefined ? { color: body.color } : {}),
        ...(body.systemState !== undefined ? { systemState: body.systemState } : {}),
      });
      await this.emit(tx, user.id, TASK_EVENTS.PERSONAL_STAGE_UPDATED, stageId);
      return stageDto(updated);
    });
  }

  async archive(user: AuthUser, stageId: string): Promise<{ ok: true; movedToStageId?: string }> {
    const workflowId = await this.workflows.ensurePersonal(user.id);
    return this.txRunner.run(async (tx) => {
      await this.stagesRepo.lockBoard(user.id, tx);
      const stages = await this.stagesRepo.liveStages(workflowId, tx);
      const stage = stages.find((s) => s.id === stageId);
      if (!stage) throw DomainException.notFound('Stage not found');
      this.assertNotLastOfState(stages, stage);
      const movedTo = await this.evacuate(tx, stages, stage);
      await this.stagesRepo.archive(tx, stageId, new Date());
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
    await this.placementsRepo.moveColumn(tx, stage.id, target.id);
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
