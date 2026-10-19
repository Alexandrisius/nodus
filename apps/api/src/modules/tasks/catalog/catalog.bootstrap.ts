import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import {
  TransactionRunner,
  type TransactionClient,
} from '../../../core/database/transaction-runner.js';
import {
  CATALOG_REVISION,
  CATALOG_TASK_TYPES,
  DEFAULT_SCHEME,
  PERSONAL_TEMPLATE,
  catalogPostFunctions,
  type CatalogStage,
  type CatalogTaskType,
  type CatalogTransition,
  type CatalogWorkflow,
} from './system-catalog.js';
import { parseRules } from '../workflow/transition-rules.js';
import { CatalogRepository, type CatalogStageData } from './catalog.repository.js';

/**
 * Бутстрап системного каталога (ADR-0020/0021): «засев один раз». Пока
 * сущность не правили руками (`customizedAt IS NULL`) и её ревизия меньше
 * текущей — применяется ревизия каталога (создание недостающего, обновление
 * по `code`, архивация живых переходов вне каталога). Настроенное не
 * трогается НИКОГДА (лог `catalog.skip_customized`) — правки владельца
 * переживают рестарты. Идемпотентен; гонка двух стартов разрешается
 * уникальными ключами (повтор проходит по ветке «уже есть»).
 */
@Injectable()
export class CatalogBootstrap implements OnApplicationBootstrap {
  constructor(
    private readonly txRunner: TransactionRunner,
    private readonly repo: CatalogRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CatalogBootstrap.name);
  }

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.ensure();
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error;
      await this.ensure(); // параллельный старт создал первым — дочитываем
    }
  }

  async ensure(): Promise<void> {
    await this.txRunner.run(async (tx) => {
      const scheme = await this.repo.ensureDefaultScheme(tx, DEFAULT_SCHEME);
      for (const { type: typeDef, workflow: workflowDef } of CATALOG_TASK_TYPES) {
        const type = await this.repo.ensureType(tx, typeDef);
        const workflow = await this.repo.ensureWorkflow(tx, {
          code: workflowDef.code,
          name: workflowDef.name,
          kind: workflowDef.kind,
          isTemplate: workflowDef.isTemplate ?? false,
        });
        await this.repo.ensureSchemeEntry(tx, scheme.id, type.id, workflow.id);
        await this.seedOnce(tx, { id: type.id, def: typeDef }, workflow.id, workflowDef);
      }
      const personal = await this.repo.ensureWorkflow(tx, {
        code: PERSONAL_TEMPLATE.code,
        name: PERSONAL_TEMPLATE.name,
        kind: PERSONAL_TEMPLATE.kind,
        isTemplate: true,
      });
      await this.seedOnce(tx, null, personal.id, PERSONAL_TEMPLATE);
    });
    this.logger.info('tasks: системный каталог маршрутов на месте (ревизия %d)', CATALOG_REVISION);
  }

  /** Применение ревизии каталога к типу и маршруту (если не настроено). */
  private async seedOnce(
    tx: TransactionClient,
    type: { id: string; def: CatalogTaskType } | null,
    workflowId: string,
    def: CatalogWorkflow,
  ): Promise<void> {
    const workflow = await tx.workflow.findUniqueOrThrow({
      where: { id: workflowId },
      select: { customizedAt: true, catalogRevision: true },
    });
    let typeCustomized = false;
    if (type) {
      const row = await tx.taskType.findUniqueOrThrow({
        where: { id: type.id },
        select: { customizedAt: true },
      });
      typeCustomized = row.customizedAt !== null;
    }
    if (workflow.customizedAt !== null || typeCustomized) {
      this.logger.info({ workflow: def.code }, 'catalog.skip_customized: каталог не трогает');
      return;
    }
    if (workflow.catalogRevision >= CATALOG_REVISION) return;

    if (type) {
      await tx.taskType.update({
        where: { id: type.id },
        data: {
          name: type.def.name,
          icon: type.def.icon,
          color: type.def.color,
          description: type.def.description,
          catalogRevision: CATALOG_REVISION,
        },
      });
    }

    const stageIds = new Map<string, string>();
    for (const [index, s] of def.stages.entries()) {
      stageIds.set(s.code, await this.seedStage(tx, workflowId, s, index));
    }

    const now = new Date();
    const catalogCodes = new Set(def.transitions.map((t) => t.code));
    for (const live of await this.repo.liveTransitions(tx, workflowId)) {
      if (live.code && !catalogCodes.has(live.code)) {
        await this.repo.archiveTransition(tx, live.id, now);
        this.logger.info(
          { workflow: def.code, code: live.code },
          'tasks: переход вне каталога ревизии заархивирован',
        );
      }
    }
    for (const [index, t] of def.transitions.entries()) {
      await this.seedTransition(tx, workflowId, t, index, stageIds);
    }

    await tx.workflow.update({
      where: { id: workflowId },
      data: { catalogRevision: CATALOG_REVISION },
    });
  }

  private async seedStage(
    tx: TransactionClient,
    workflowId: string,
    s: CatalogStage,
    index: number,
  ): Promise<string> {
    const want: CatalogStageData = {
      name: s.name,
      color: s.color,
      sortOrder: index,
      systemState: s.systemState,
      outcome: s.outcome ?? null,
      isInitial: s.isInitial ?? false,
    };
    const found = await this.repo.findStage(tx, workflowId, s.code);
    if (!found) {
      const created = await this.repo.createStage(tx, workflowId, s.code, want);
      return created.id;
    }
    const drift = stageDrift(
      {
        name: found.name,
        color: found.color,
        sortOrder: found.sortOrder,
        systemState: found.systemState,
        outcome: found.outcome,
        isInitial: found.isInitial,
      },
      want,
    );
    if (drift) await this.repo.updateStage(tx, found.id, drift);
    if (drift?.systemState !== undefined) {
      const moved = await this.repo.restateStageTasks(tx, found.id, want.systemState, new Date());
      this.logger.warn(
        { workflow: workflowId, stage: s.code, systemState: want.systemState, tasks: moved },
        'tasks: системное состояние стадии каталога изменено — задачи пересчитаны',
      );
    }
    return found.id;
  }

  private async seedTransition(
    tx: TransactionClient,
    workflowId: string,
    t: CatalogTransition,
    index: number,
    stageIds: Map<string, string>,
  ): Promise<void> {
    const data = {
      name: t.name,
      fromStageId: t.from === null ? null : stageIds.get(t.from)!,
      toStageId: stageIds.get(t.to)!,
      display: t.display,
      sortOrder: index,
      rules: parseRules({
        ...t.rules,
        postFunctions: catalogPostFunctions(t, stageIds),
      }),
    };
    const found = await this.repo.findTransition(tx, workflowId, t.code);
    if (found) await this.repo.updateTransition(tx, found.id, data);
    else await this.repo.createTransition(tx, workflowId, t.code, data);
  }
}

/** Поля системной стадии, разошедшиеся с каталогом (null — совпадает). */
export function stageDrift(
  found: CatalogStageData,
  want: CatalogStageData,
): Partial<CatalogStageData> | null {
  const drift: Partial<CatalogStageData> = {};
  if (found.name !== want.name) drift.name = want.name;
  if (found.color !== want.color) drift.color = want.color;
  if (found.sortOrder !== want.sortOrder) drift.sortOrder = want.sortOrder;
  if (found.systemState !== want.systemState) drift.systemState = want.systemState;
  if (found.outcome !== want.outcome) drift.outcome = want.outcome;
  if (found.isInitial !== want.isInitial) drift.isInitial = want.isInitial;
  return Object.keys(drift).length > 0 ? drift : null;
}
