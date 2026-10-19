import { Inject, Injectable } from '@nestjs/common';
import {
  checkWorkflowDocument,
  ErrorCode,
  TASK_EVENTS,
  type AuthUser,
  type PublishWorkflowBody,
  type PublishWorkflowResult,
  type WorkflowDetail,
  type WorkflowDocument,
} from '@nodus/contracts';

import type { Prisma } from '../../../../generated/prisma/client.js';
import { TransactionRunner } from '../../../../core/database/transaction-runner.js';
import { DomainException } from '../../../../core/errors/domain-exception.js';
import { EventBus } from '../../../../core/events/event-bus.js';
import {
  USER_PROFILE_READER,
  type UserProfileReader,
} from '../../../../core/ports/user-profile.port.js';
import { serverChecksOf } from './publish-checks.js';
import {
  missingMigrations,
  resolveRules,
  planWorkflowPublish,
  resolveDocId,
  type PlannerSnapshot,
} from './publish-planner.js';
import { WorkflowRepository, type LoadedWorkflow } from '../workflow.repository.js';

/** Внутренний результат публикации: тело BullMQ-задания переноса. */
export interface PublishOutcome extends PublishWorkflowResult {
  workflowId: string;
  moves: { fromStageId: string; toStageId: string }[];
  restates: { stageId: string; systemState: string }[];
}

/**
 * Чтение и публикация маршрута (#378, ADR-0021). Публикация — одна
 * транзакция: блокировка строки, оптимистичная версия, серверные проверки
 * (uuid-принадлежность, цели переносов), план и применение (архив вместо
 * удаления), событие `task.workflow_published`; после коммита ставится
 * BullMQ-задание `tasks-workflow-sync` (workflow-sync.job.ts).
 */
@Injectable()
export class WorkflowEditorService {
  constructor(
    private readonly txRunner: TransactionRunner,
    private readonly workflows: WorkflowRepository,
    private readonly eventBus: EventBus,
    @Inject(USER_PROFILE_READER) private readonly profiles: UserProfileReader,
  ) {}

  /** GET /tasks/workflows/:id — документ живого маршрута + счётчики. */
  async read(workflowId: string): Promise<WorkflowDetail> {
    const row = await this.workflows.load(workflowId);
    const workflow = await this.findTaskWorkflow(workflowId);
    const typeIds = await this.workflows.typeIdsOf(workflowId);
    const refs = workflow.publishedById
      ? await this.profiles.findRefs([workflow.publishedById], undefined)
      : [];
    return {
      id: workflowId,
      typeIds,
      version: workflow.version,
      publishedAt: workflow.publishedAt?.toISOString() ?? null,
      publishedBy: refs[0] ?? null,
      document: documentOf(row),
      stageTaskCounts: await this.workflows.stageTaskCounts(workflowId),
    };
  }

  /** POST /tasks/workflows/:id/publish — публикация документа. */
  async publish(
    user: AuthUser,
    workflowId: string,
    body: PublishWorkflowBody,
    afterCommit?: (outcome: PublishOutcome) => Promise<void>,
  ): Promise<PublishWorkflowResult> {
    const outcome = await this.txRunner.run(async (tx) => {
      await this.workflows.lockForUpdate(tx, workflowId);
      const workflow = await this.findTaskWorkflow(workflowId, tx);
      if (workflow.version !== body.baseVersion) {
        throw new DomainException(
          ErrorCode.WORKFLOW_VERSION_CONFLICT,
          'Workflow was published by someone else',
          { currentVersion: workflow.version },
        );
      }

      const problems = checkWorkflowDocument(body.document);
      if (problems.some((p) => p.severity === 'error')) {
        throw new DomainException(ErrorCode.WORKFLOW_INVALID, 'Workflow document is invalid', {
          problems,
        });
      }

      const loaded = await this.workflows.load(workflowId, tx);
      this.serverChecks(loaded, body.document, body.migrations);

      const snapshot: PlannerSnapshot = {
        stages: loaded.stages.map((s) => ({
          id: s.id,
          name: s.name,
          color: s.color,
          systemState: s.systemState,
          outcome: s.outcome,
          isInitial: s.isInitial,
          sortOrder: s.sortOrder,
        })),
        transitions: loaded.transitions.map((t) => ({
          id: t.id,
          name: t.name,
          fromStageId: t.fromStageId,
          toStageId: t.toStageId,
          display: t.display,
          sortOrder: t.sortOrder,
        })),
        taskCounts: await this.workflows.stageTaskCounts(workflowId, tx),
      };
      const plan = planWorkflowPublish(snapshot, body.document, body.migrations);
      const gaps = missingMigrations(plan);
      if (gaps.length > 0) {
        throw new DomainException(
          ErrorCode.WORKFLOW_MIGRATION_REQUIRED,
          'Archived stages still have tasks',
          { stages: gaps },
        );
      }

      const now = new Date();
      // Новые стадии: кода нет — клиентский `code` не читается, сервер верит
      // только своим кодам каталога.
      const createdIds = new Map<string, string>();
      for (const create of plan.stageCreates) {
        const created = await tx.workflowStage.create({
          data: {
            workflowId,
            code: null,
            name: create.name,
            color: create.color,
            sortOrder: create.sortOrder,
            systemState: create.systemState,
            outcome: create.outcome,
            isInitial: create.isInitial,
          },
        });
        createdIds.set(create.docId, created.id);
      }
      for (const update of plan.stageUpdates) {
        await tx.workflowStage.update({
          where: { id: update.stageId },
          data: {
            name: update.name,
            color: update.color,
            sortOrder: update.sortOrder,
            systemState: update.systemState,
            outcome: update.outcome,
            isInitial: update.isInitial,
          },
        });
      }

      const resolve = (docId: string | null): string | null =>
        docId === null ? null : (resolveDocId(docId, createdIds) ?? docId);
      const rulesOf = (id: string): Prisma.InputJsonValue =>
        resolveRules(
          body.document.transitions.find((tr) => tr.id === id)?.rules ?? {
            conditions: [],
            validators: [],
            postFunctions: [],
          },
          createdIds,
        ) as Prisma.InputJsonValue;
      for (const write of plan.transitionCreates) {
        await tx.workflowTransition.create({
          data: {
            workflowId,
            code: null,
            name: write.name,
            fromStageId: resolve(write.fromStageId),
            toStageId: resolve(write.toStageId)!,
            display: write.display,
            sortOrder: write.sortOrder,
            rules: rulesOf(write.id),
          },
        });
      }
      for (const write of plan.transitionUpdates) {
        await tx.workflowTransition.update({
          where: { id: write.id },
          data: {
            name: write.name,
            fromStageId: resolve(write.fromStageId),
            toStageId: resolve(write.toStageId)!,
            display: write.display,
            sortOrder: write.sortOrder,
            archivedAt: null,
            rules: rulesOf(write.id),
          },
        });
      }
      for (const archive of plan.transitionArchives) {
        await tx.workflowTransition.update({
          where: { id: archive.transitionId },
          data: { archivedAt: now },
        });
      }
      for (const archive of plan.stageArchives) {
        await tx.workflowStage.update({
          where: { id: archive.stageId },
          data: { archivedAt: now, isInitial: false },
        });
      }

      const published = await tx.workflow.update({
        where: { id: workflowId },
        data: {
          version: { increment: 1 },
          publishedAt: now,
          publishedById: user.id,
          customizedAt: now,
        },
        select: { version: true },
      });

      const entries = await this.workflows.typeIdsOf(workflowId, tx);
      await this.eventBus.emit(
        tx,
        TASK_EVENTS.WORKFLOW_PUBLISHED,
        {
          workflowId,
          typeIds: entries,
          version: published.version,
          moves: plan.moves.length,
          restates: plan.restates.length,
        },
        { actorId: user.id, aggregateType: 'workflow', aggregateId: workflowId },
      );

      return {
        workflowId,
        version: published.version,
        publishedAt: now.toISOString(),
        scheduledMoves: plan.moves.reduce(
          (sum, move) => sum + (snapshot.taskCounts[move.fromStageId] ?? 0),
          0,
        ),
        moves: plan.moves.map((m) => ({
          fromStageId: m.fromStageId,
          toStageId: resolve(m.toDocId)!,
        })),
        restates: plan.restates,
      } satisfies PublishOutcome;
    });

    if (afterCommit) await afterCommit(outcome);
    return {
      version: outcome.version,
      publishedAt: outcome.publishedAt,
      scheduledMoves: outcome.scheduledMoves,
    };
  }

  /** Редактору доступны только маршруты задач: личные доски и шаблон — 404
   *  (security #378; uuid personal-маршрутов API не отдаёт, гвард добивает). */
  private async findTaskWorkflow(
    workflowId: string,
    tx?: Parameters<Parameters<TransactionRunner['run']>[0]>[0],
  ) {
    const workflow = await this.workflows.findMeta(workflowId, tx);
    if (!workflow || workflow.kind !== 'task') {
      throw DomainException.notFound('Workflow not found');
    }
    return workflow;
  }

  serverChecks = serverChecksOf;
}

/** Документ живого маршрута → документ контракта. */
export function documentOf(row: LoadedWorkflow): WorkflowDocument {
  return {
    stages: row.stages.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      color: s.color as WorkflowDocument['stages'][number]['color'],
      systemState: s.systemState as WorkflowDocument['stages'][number]['systemState'],
      outcome: (s.outcome as 'success' | 'cancelled' | null) ?? null,
      isInitial: s.isInitial,
      sortOrder: s.sortOrder,
    })),
    transitions: row.transitions.map((t) => ({
      id: t.id,
      code: null,
      name: t.name,
      fromStageId: t.fromStageId,
      toStageId: t.toStageId,
      display: t.display,
      sortOrder: t.sortOrder,
      rules: t.rules,
    })),
  };
}
