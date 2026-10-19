import type { WorkflowDocument, WorkflowMigration } from '@nodus/contracts';

/**
 * Планировщик публикации маршрута (#378, ADR-0021) — чистая функция: снимок
 * живого маршрута + документ публикации → план изменений БД. Код клиента
 * не читается (сервер верит только своим кодам), uuid-ссылки документа
 * проверяются вызывающим на принадлежность маршруту. Unit-тестируется без БД.
 */

export interface PlannerStage {
  id: string;
  name: string;
  color: string;
  systemState: string;
  outcome: string | null;
  isInitial: boolean;
  sortOrder: number;
}

export interface PlannerTransition {
  id: string;
  name: string;
  fromStageId: string | null;
  toStageId: string;
  display: string;
  sortOrder: number;
}

export interface PlannerSnapshot {
  stages: PlannerStage[];
  transitions: PlannerTransition[];
  /** Живые задачи по стадиям (для обязательных переносов). */
  taskCounts: Record<string, number>;
}

export interface StageCreate {
  docId: string;
  name: string;
  color: string;
  systemState: string;
  outcome: string | null;
  isInitial: boolean;
  sortOrder: number;
}

export interface StageUpdate {
  stageId: string;
  name: string;
  color: string;
  systemState: string;
  outcome: string | null;
  isInitial: boolean;
  sortOrder: number;
  /** Сменился этап — денормализация задач («Мой план» обновится). */
  restated: boolean;
}

export interface TransitionWrite {
  /** docId нового перехода (new:*) или uuid существующего. */
  id: string;
  name: string;
  fromStageId: string | null;
  toStageId: string;
  display: string;
  sortOrder: number;
}

export interface WorkflowPublishPlan {
  stageCreates: StageCreate[];
  stageUpdates: StageUpdate[];
  /** Архивируемые стадии с живыми задачами — обязателен перенос. */
  stageArchives: { stageId: string; name: string; taskCount: number }[];
  transitionCreates: TransitionWrite[];
  transitionUpdates: TransitionWrite[];
  transitionArchives: { transitionId: string }[];
  /** Переносы задач (uuid стадии → docId цели, из body публикации). */
  moves: { fromStageId: string; toDocId: string }[];
  /** Стадии со сменой этапа (событие публикации, пересчёт денормализации). */
  restates: { stageId: string; systemState: string }[];
}

const isNew = (id: string): boolean => id.startsWith('new:');

/** План изменений: создать / обновить / архивировать. */
export function planWorkflowPublish(
  current: PlannerSnapshot,
  document: WorkflowDocument,
  migrations: readonly WorkflowMigration[],
): WorkflowPublishPlan {
  const currentStagesById = new Map(current.stages.map((s) => [s.id, s]));
  const currentTransitionsById = new Map(current.transitions.map((t) => [t.id, t]));

  const stageCreates: StageCreate[] = [];
  const stageUpdates: StageUpdate[] = [];
  const stageArchives: WorkflowPublishPlan['stageArchives'] = [];
  const restates: WorkflowPublishPlan['restates'] = [];

  for (const stage of document.stages) {
    const fields = {
      name: stage.name,
      color: stage.color,
      systemState: stage.systemState,
      outcome: stage.outcome,
      isInitial: stage.isInitial,
      sortOrder: stage.sortOrder,
    };
    if (isNew(stage.id) || !currentStagesById.has(stage.id)) {
      stageCreates.push({ docId: stage.id, ...fields });
      continue;
    }
    const existing = currentStagesById.get(stage.id)!;
    const restated = existing.systemState !== stage.systemState;
    const unchanged =
      existing.name === fields.name &&
      existing.color === fields.color &&
      existing.systemState === fields.systemState &&
      existing.outcome === fields.outcome &&
      existing.isInitial === fields.isInitial &&
      existing.sortOrder === fields.sortOrder;
    if (!unchanged) stageUpdates.push({ stageId: stage.id, ...fields, restated });
    if (restated) restates.push({ stageId: stage.id, systemState: stage.systemState });
  }

  const docStageIds = new Set(document.stages.map((s) => s.id));
  for (const stage of current.stages) {
    if (!docStageIds.has(stage.id)) {
      stageArchives.push({
        stageId: stage.id,
        name: stage.name,
        taskCount: current.taskCounts[stage.id] ?? 0,
      });
    }
  }

  const transitionCreates: TransitionWrite[] = [];
  const transitionUpdates: TransitionWrite[] = [];
  const transitionArchives: WorkflowPublishPlan['transitionArchives'] = [];
  for (const t of document.transitions) {
    const write: TransitionWrite = {
      id: t.id,
      name: t.name,
      fromStageId: t.fromStageId,
      toStageId: t.toStageId,
      display: t.display,
      sortOrder: t.sortOrder,
    };
    if (isNew(t.id) || !currentTransitionsById.has(t.id)) {
      transitionCreates.push(write);
      continue;
    }
    const existing = currentTransitionsById.get(t.id)!;
    const unchanged =
      existing.name === write.name &&
      existing.fromStageId === write.fromStageId &&
      existing.toStageId === write.toStageId &&
      existing.display === write.display &&
      existing.sortOrder === write.sortOrder;
    if (!unchanged) transitionUpdates.push(write);
  }
  const docTransitionIds = new Set(document.transitions.map((t) => t.id));
  for (const t of current.transitions) {
    if (!docTransitionIds.has(t.id)) transitionArchives.push({ transitionId: t.id });
  }

  // Переносы: только для архивируемых стадий (лишнее игнорируем).
  const archivedIds = new Set(stageArchives.map((a) => a.stageId));
  const moves = migrations
    .filter((m) => archivedIds.has(m.fromStageId))
    .map((m) => ({ fromStageId: m.fromStageId, toDocId: m.toStageId }));

  return {
    stageCreates,
    stageUpdates,
    stageArchives,
    transitionCreates,
    transitionUpdates,
    transitionArchives,
    moves,
    restates,
  };
}

/** Обязательные переносы: архивируемые стадии с задачами без переноса. */
export function missingMigrations(plan: WorkflowPublishPlan): { stageId: string; count: number }[] {
  const moved = new Set(plan.moves.map((m) => m.fromStageId));
  return plan.stageArchives
    .filter((a) => a.taskCount > 0 && !moved.has(a.stageId))
    .map((a) => ({ stageId: a.stageId, count: a.taskCount }));
}

/** Резолв docId стадии документа → uuid после создания новых (uuid для uuid). */
export function resolveDocId(docId: string, createdIds: Map<string, string>): string | undefined {
  if (docId.startsWith('new:')) return createdIds.get(docId);
  return docId;
}

/** Правила перехода к публикации: цели route_if `new:*` резолвятся в
 *  созданные uuid — иначе опубликованная схема ≠ исполняемая (security
 *  #378, целостность: пост-функция молча не находила цель). */
export function resolveRules<T extends { postFunctions: readonly unknown[] }>(
  rules: T,
  createdIds: Map<string, string>,
): T {
  const posts = rules.postFunctions as readonly { kind?: string; toStageId?: string }[];
  const needsResolve = posts.some(
    (pf) =>
      pf.kind === 'route_if' && typeof pf.toStageId === 'string' && pf.toStageId.startsWith('new:'),
  );
  if (!needsResolve) return rules;
  return {
    ...rules,
    postFunctions: (posts as readonly Record<string, unknown>[]).map((pf) =>
      pf.kind === 'route_if' && typeof pf.toStageId === 'string'
        ? { ...pf, toStageId: resolveDocId(pf.toStageId, createdIds) ?? pf.toStageId }
        : pf,
    ),
  } as T;
}
