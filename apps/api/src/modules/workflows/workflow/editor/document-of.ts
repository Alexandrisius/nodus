import type { WorkflowDocument } from '@nodus/contracts';

import { liveLayout } from './layout.js';
import type { LoadedWorkflow } from '../workflow.repository.js';

/** Документ живого маршрута → документ контракта (+ раскладка холста). */
export function documentOf(
  row: LoadedWorkflow,
  layout?: unknown,
  creation?: unknown,
): WorkflowDocument {
  return {
    ...(creation === null || creation === undefined
      ? {}
      : { creation: creation as WorkflowDocument['creation'] }),
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
      form: t.form ?? { enabled: false, sections: [] },
    })),
    layout: liveLayout(layout, {
      stageIds: new Set(row.stages.map((s) => s.id)),
      transitionIds: new Set(row.transitions.map((t) => t.id)),
    }),
  };
}
