import type { WorkflowDraftDocument } from '@nodus/contracts';

/** Инварианты документа рабочей копии (#378): sortOrder = индекс в колонке
 *  этапа (нормализация после каждой структурной правки — раскладка и
 *  публикация читают одно и то же), история — снимки ≤100, id новых
 *  элементов `new:<uuid>`. */

export const HISTORY_LIMIT = 100;

export function newId(): string {
  return `new:${crypto.randomUUID()}`;
}

export function normalize(doc: WorkflowDraftDocument): WorkflowDraftDocument {
  const counters = new Map<string, number>();
  const stages = doc.stages.map((stage) => {
    const next = counters.get(stage.systemState) ?? 0;
    counters.set(stage.systemState, next + 1);
    return { ...stage, sortOrder: next };
  });
  return { ...doc, stages };
}

export interface HistoryTail {
  document: WorkflowDraftDocument;
  past: WorkflowDraftDocument[];
  future: WorkflowDraftDocument[];
  dirty: boolean;
}

export function withHistory(
  state: {
    document: WorkflowDraftDocument;
    past: WorkflowDraftDocument[];
    future: WorkflowDraftDocument[];
    dirty: boolean;
  },
  next: WorkflowDraftDocument,
): HistoryTail {
  return {
    document: next,
    past: [...state.past, state.document].slice(-HISTORY_LIMIT),
    future: [],
    dirty: true,
  };
}

/** Шаг истории: новый документ, границы past/future, dirty против baseline. */
export function stepHistory(
  state: { document: WorkflowDraftDocument; baseline: WorkflowDraftDocument; dirty: boolean },
  document: WorkflowDraftDocument,
  past: WorkflowDraftDocument[],
  future: WorkflowDraftDocument[],
): {
  document: WorkflowDraftDocument;
  past: WorkflowDraftDocument[];
  future: WorkflowDraftDocument[];
  dirty: boolean;
} {
  return {
    document,
    past: past.slice(-HISTORY_LIMIT),
    future: future.slice(0, HISTORY_LIMIT),
    dirty: JSON.stringify(document) !== JSON.stringify(state.baseline),
  };
}
