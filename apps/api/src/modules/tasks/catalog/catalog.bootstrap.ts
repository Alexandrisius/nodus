import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

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
import { CatalogRepository, type CatalogStageData } from './catalog.repository.js';

/**
 * Бутстрап системного каталога (ADR-0020): при старте api создаёт
 * недостающие тип, маршруты (стадии + переходы) и схему по `code` и
 * синхронизирует СИСТЕМНЫЕ стадии (имя, цвет, порядок, systemState,
 * isInitial) и переходы (имя, правила, порядок, from/to) с кодом (каталог —
 * данные кода; правка маршрута = правка system-catalog.ts, без миграции).
 * Смена systemState стадии пересчитывает денормализацию задач в ней в той же
 * транзакции. Шаблон «Мой план» синхронизируется только по составу (личные
 * копии сотрудников не трогаются: у их колонок нет code). Идемпотентен; гонка
 * двух стартов разрешается уникальными ключами (повтор проходит по ветке
 * «уже есть»).
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
      const type = await this.repo.ensureType(tx, SYSTEM_TASK_TYPE);
      const workflowId = await this.ensureWorkflow(tx, DEFAULT_TASK_WORKFLOW);
      await this.ensureWorkflow(tx, PERSONAL_TEMPLATE);
      const scheme = await this.repo.ensureDefaultScheme(tx, DEFAULT_SCHEME);
      await this.repo.ensureSchemeEntry(tx, scheme.id, type.id, workflowId);
    });
    this.logger.info('tasks: системный каталог маршрутов на месте');
  }

  private async ensureWorkflow(tx: TransactionClient, def: CatalogWorkflow): Promise<string> {
    const workflow = await this.repo.ensureWorkflow(tx, {
      code: def.code,
      name: def.name,
      kind: def.kind,
      isTemplate: def.isTemplate ?? false,
    });
    const stageIds = new Map<string, string>();
    for (const [index, s] of def.stages.entries()) {
      const want: CatalogStageData = {
        name: s.name,
        color: s.color,
        sortOrder: index,
        systemState: s.systemState,
        isInitial: s.isInitial ?? false,
      };
      const found = await this.repo.findStage(tx, workflow.id, s.code);
      if (!found) {
        const created = await this.repo.createStage(tx, workflow.id, s.code, want);
        stageIds.set(s.code, created.id);
        continue;
      }
      const drift = stageDrift(found, want);
      if (drift) await this.repo.updateStage(tx, found.id, drift);
      if (drift?.systemState !== undefined) {
        const moved = await this.repo.restateStageTasks(tx, found.id, want.systemState, new Date());
        this.logger.warn(
          { stage: s.code, workflow: def.code, systemState: want.systemState, tasks: moved },
          'tasks: системное состояние стадии каталога изменено — задачи пересчитаны',
        );
      }
      stageIds.set(s.code, found.id);
    }
    for (const [index, t] of def.transitions.entries()) {
      const data = {
        name: t.name,
        fromStageId: t.from === null ? null : stageIds.get(t.from)!,
        toStageId: stageIds.get(t.to)!,
        sortOrder: index,
        rules: parseRules(t.rules),
      };
      const found = await this.repo.findTransition(tx, workflow.id, t.code);
      if (found) await this.repo.updateTransition(tx, found.id, data);
      else await this.repo.createTransition(tx, workflow.id, t.code, data);
    }
    return workflow.id;
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
  if (found.isInitial !== want.isInitial) drift.isInitial = want.isInitial;
  return Object.keys(drift).length > 0 ? drift : null;
}
