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

/** Сменилась ли СТРУКТУРА маршрута (статусы и кнопки) против опубликованной.
 *  Расстановка холста — оформление: она сохраняется сама, без публикации, и
 *  черновиком маршрута не считается. */
export function structureChanged(
  document: WorkflowDraftDocument,
  baseline: WorkflowDraftDocument,
): boolean {
  return (
    JSON.stringify([document.stages, document.transitions]) !==
    JSON.stringify([baseline.stages, baseline.transitions])
  );
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
    baseline: WorkflowDraftDocument;
    past: WorkflowDraftDocument[];
    future: WorkflowDraftDocument[];
  },
  next: WorkflowDraftDocument,
): HistoryTail {
  return {
    document: next,
    past: [...state.past, state.document].slice(-HISTORY_LIMIT),
    future: [],
    dirty: structureChanged(next, state.baseline),
  };
}

/** Шаг истории: новый документ, границы past/future, dirty — структура
 *  против baseline. */
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
    dirty: structureChanged(document, state.baseline),
  };
}
