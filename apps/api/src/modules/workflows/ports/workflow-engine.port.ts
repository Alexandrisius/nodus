import type { ProcessCategory, ProcessType, WorkflowTransition } from '@nodus/contracts';

import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import type {
  WorkflowActor,
  WorkflowEntityStage,
} from '../../../core/ports/workflow-entity.port.js';

/** Чем выбран переход: кнопкой, колонкой глобальной доски или колонкой
 *  «Моего плана» (системное состояние). */
export type TransitionChoice =
  { transitionId: string } | { stageId: string } | { systemState: string };

/**
 * Порт движка маршрутов для модулей-владельцев сущностей (ADR-0012,
 * ADR-0024): доступные переходы и выполнение — В ТРАНЗАКЦИИ ВЫЗЫВАЮЩЕГО.
 * Движок сам ведёт порядок «замок → субъект → условия → гейты → обход →
 * применение адаптером»; чужие таблицы не пишет, журнал переходов добавит
 * #380 в эту же точку.
 */
export const WORKFLOW_ENGINE = Symbol('WORKFLOW_ENGINE');

export interface WorkflowEnginePort {
  /** Кнопки маршрута, доступные актору (условия «кто» пройдены; гейты —
   *  с причинами блокировки). */
  available(
    tx: TransactionClient,
    entityId: string,
    category: ProcessCategory,
    actor: WorkflowActor,
  ): Promise<WorkflowTransition[]>;

  /** Выполнить переход: замок, условия, гейты (обход — флаг + причина),
   *  смена стадии адаптером. Возвращает целевую стадию. */
  execute(
    tx: TransactionClient,
    entityId: string,
    category: ProcessCategory,
    actor: WorkflowActor,
    choice: TransitionChoice,
    opts?: { override?: boolean; reason?: string },
  ): Promise<WorkflowEntityStage>;
}

/** Тип процесса с маршрутом — то, что нужно модулю-владельцу для создания
 *  сущности и смены типа (маршрут типа всегда один — схема «тип → маршрут»). */
export type ProcessTypeWithWorkflow = ProcessType;
