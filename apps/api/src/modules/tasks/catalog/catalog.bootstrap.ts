import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { Prisma } from '../../../generated/prisma/client.js';
import {
  TransactionRunner,
  type TransactionClient,
} from '../../../core/database/transaction-runner.js';
import {
  DEFAULT_SCHEME,
  DEFAULT_TASK_WORKFLOW,
  PERSONAL_TEMPLATE,
  SYSTEM_TASK_TYPE,
  type CatalogWorkflow,
} from './system-catalog.js';
import { parseRules } from '../workflow/transition-rules.js';

/**
 * Бутстрап системного каталога (ADR-0020): при старте api создаёт
 * недостающие тип, маршруты (стадии + переходы) и схему по `code`.
 * Существующие записи не трогает — правки каталога делаются данными, а не
 * тихим ре-сидом поверх настроек. Идемпотентен; гонка двух стартов
 * разрешается уникальными ключами (повтор проходит по ветке «уже есть»).
 */
@Injectable()
export class CatalogBootstrap implements OnApplicationBootstrap {
  constructor(
    private readonly txRunner: TransactionRunner,
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
      const type =
        (await tx.taskType.findUnique({ where: { code: SYSTEM_TASK_TYPE.code } })) ??
        (await tx.taskType.create({ data: { ...SYSTEM_TASK_TYPE, isSystem: true } }));
      const workflowId = await this.ensureWorkflow(tx, DEFAULT_TASK_WORKFLOW);
      await this.ensureWorkflow(tx, PERSONAL_TEMPLATE);
      const scheme =
        (await tx.workflowScheme.findUnique({ where: { code: DEFAULT_SCHEME.code } })) ??
        (await tx.workflowScheme.create({ data: { ...DEFAULT_SCHEME, isDefault: true } }));
      await tx.workflowSchemeEntry.upsert({
        where: { schemeId_taskTypeId: { schemeId: scheme.id, taskTypeId: type.id } },
        update: {},
        create: { schemeId: scheme.id, taskTypeId: type.id, workflowId },
      });
    });
    this.logger.info('tasks: системный каталог маршрутов на месте');
  }

  private async ensureWorkflow(tx: TransactionClient, def: CatalogWorkflow): Promise<string> {
    const existing = await tx.workflow.findUnique({ where: { code: def.code } });
    const workflow =
      existing ??
      (await tx.workflow.create({
        data: {
          code: def.code,
          name: def.name,
          kind: def.kind,
          isSystem: true,
          isTemplate: def.isTemplate ?? false,
        },
      }));
    const stageIds = new Map<string, string>();
    for (const [index, s] of def.stages.entries()) {
      const stage =
        (await tx.workflowStage.findUnique({
          where: { workflowId_code: { workflowId: workflow.id, code: s.code } },
        })) ??
        (await tx.workflowStage.create({
          data: {
            workflowId: workflow.id,
            code: s.code,
            name: s.name,
            color: s.color,
            sortOrder: index,
            systemState: s.systemState,
            isInitial: s.isInitial ?? false,
          },
        }));
      stageIds.set(s.code, stage.id);
    }
    for (const [index, t] of def.transitions.entries()) {
      const found = await tx.workflowTransition.findUnique({
        where: { workflowId_code: { workflowId: workflow.id, code: t.code } },
      });
      if (found) continue;
      await tx.workflowTransition.create({
        data: {
          workflowId: workflow.id,
          code: t.code,
          name: t.name,
          fromStageId: t.from === null ? null : stageIds.get(t.from)!,
          toStageId: stageIds.get(t.to)!,
          sortOrder: index,
          rules: parseRules(t.rules) as Prisma.InputJsonValue,
        },
      });
    }
    return workflow.id;
  }
}
