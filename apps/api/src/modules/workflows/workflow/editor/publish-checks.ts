import { ErrorCode, type WorkflowDocument, type WorkflowMigration } from '@nodus/contracts';

import { DomainException } from '../../../../core/errors/domain-exception.js';
import type { LoadedWorkflow } from '../workflow.repository.js';

/**
 * Серверные проверки публикации (#378, security-чекпоинты ревью): uuid-элементы
 * документа принадлежат этому маршруту; ссылки переходов и цели переносов —
 * живые статусы документа (новые или существующие). Клиентскому `code` сервер
 * не верит — коды читаются только из БД.
 */
export function serverChecksOf(
  loaded: LoadedWorkflow,
  document: WorkflowDocument,
  migrations: readonly WorkflowMigration[],
): void {
  const stageIds = new Set(loaded.stages.map((s) => s.id));
  const docStageIds = new Set(document.stages.map((s) => s.id));
  const foreignStages = document.stages.filter(
    (s) => !s.id.startsWith('new:') && !stageIds.has(s.id),
  );
  if (foreignStages.length > 0) {
    throw new DomainException(ErrorCode.WORKFLOW_INVALID, 'Document references foreign stages');
  }
  const foreignTransitions = document.transitions.filter(
    (t) => !t.id.startsWith('new:') && !loaded.transitions.some((live) => live.id === t.id),
  );
  if (foreignTransitions.length > 0) {
    throw new DomainException(
      ErrorCode.WORKFLOW_INVALID,
      'Document references foreign transitions',
    );
  }
  for (const t of document.transitions) {
    if (t.fromStageId !== null && !docStageIds.has(t.fromStageId)) {
      throw new DomainException(
        ErrorCode.WORKFLOW_INVALID,
        'Transition source is not a stage of the document',
      );
    }
    if (!docStageIds.has(t.toStageId)) {
      throw new DomainException(
        ErrorCode.WORKFLOW_INVALID,
        'Transition target is not a stage of the document',
      );
    }
  }
  for (const m of migrations) {
    if (!stageIds.has(m.fromStageId)) {
      throw new DomainException(
        ErrorCode.WORKFLOW_INVALID,
        'Migration source is not a stage of this workflow',
      );
    }
    if (!docStageIds.has(m.toStageId)) {
      throw new DomainException(
        ErrorCode.WORKFLOW_INVALID,
        'Migration target is not a stage of the document',
      );
    }
  }
}
