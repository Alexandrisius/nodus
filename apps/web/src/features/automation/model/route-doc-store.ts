import { create } from 'zustand';
import { z } from 'zod';
import type {
  TaskSystemState,
  TransitionDisplay,
  WorkflowDetail,
  WorkflowDraftDocument,
  WorkflowDraftStage,
  WorkflowDraftTransition,
} from '@nodus/contracts';
import { workflowDraftDocumentSchema, ui } from '@nodus/contracts';

/**
 * Стор рабочей копии маршрута (#378, ADR-0021): документ живёт на клиенте,
 * история — снимки (до 100 шагов), черновик автосохраняется в localStorage
 * (`nodus-workflow-draft-v1:<workflowId>`) с zod-валидацией rehydrate;
 * публикация и «Отменить изменения» сбрасывают dirty.
 */

const HISTORY_LIMIT = 100;

export type SelectionRef = { kind: 'stage' | 'transition'; id: string } | null;

interface RouteDocState {
  workflowId: string;
  baseVersion: number;
  document: WorkflowDraftDocument;
  /** Снимок опубликованной версии (сброс dirty = вернуть его). */
  baseline: WorkflowDraftDocument;
  selection: SelectionRef;
  dirty: boolean;
  past: WorkflowDraftDocument[];
  future: WorkflowDraftDocument[];
  /** Когда черновик сохранён (баннер «Продолжить черновик от …»). */
  draftSavedAt: string | null;

  load: (detail: WorkflowDetail) => void;
  select: (ref: SelectionRef) => void;

  addStage: (band: TaskSystemState) => string;
  patchStage: (id: string, patch: Partial<Omit<WorkflowDraftStage, 'id' | 'sortOrder'>>) => void;
  moveStage: (id: string, targetIndex: number) => void;
  removeStage: (id: string) => void;

  addTransition: (from: string | null, to: string) => string | null;
  patchTransition: (
    id: string,
    patch: Partial<Omit<WorkflowDraftTransition, 'id' | 'sortOrder'>>,
  ) => void;
  setTransitionPrimary: (id: string) => void;
  removeTransition: (id: string) => void;
  moveTransition: (id: string, targetIndex: number) => void;

  undo: () => void;
  redo: () => void;
  discard: () => void;
  markPublished: (version: number) => void;
}

function newId(): string {
  return `new:${crypto.randomUUID()}`;
}

/** sortOrder = индекс внутри колонки этапа (нормализуется после каждой
 *  структурной правки — раскладка и публикация читают одно и то же). */
function normalize(doc: WorkflowDraftDocument): WorkflowDraftDocument {
  const counters = new Map<TaskSystemState, number>();
  const stages = doc.stages.map((stage) => {
    const next = counters.get(stage.systemState) ?? 0;
    counters.set(stage.systemState, next + 1);
    return { ...stage, sortOrder: next };
  });
  return { stages, transitions: doc.transitions };
}

function withHistory(
  state: Pick<RouteDocState, 'document' | 'past' | 'future' | 'dirty'>,
  next: WorkflowDraftDocument,
): Pick<RouteDocState, 'document' | 'past' | 'future' | 'dirty'> {
  return {
    document: next,
    past: [...state.past, state.document].slice(-HISTORY_LIMIT),
    future: [],
    dirty: true,
  };
}

/** Черновик в localStorage: envelope с базовой версией (zod на границе, I7). */
const draftEnvelopeSchema = z.object({
  document: workflowDraftDocumentSchema,
  baseVersion: z.number().int().min(1),
  savedAt: z.string(),
});

function readDraft(
  workflowId: string,
  version: number,
): { document: WorkflowDraftDocument; savedAt: string } | null {
  try {
    const raw = localStorage.getItem(draftKey(workflowId));
    if (!raw) return null;
    const parsed = draftEnvelopeSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.baseVersion !== version) return null;
    return { document: parsed.data.document, savedAt: parsed.data.savedAt };
  } catch {
    return null;
  }
}

function draftKey(workflowId: string): string {
  return `nodus-workflow-draft-v1:${workflowId}`;
}

function persistDraft(state: RouteDocState): void {
  const payload = {
    document: state.document,
    baseVersion: state.baseVersion,
    savedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(draftKey(state.workflowId), JSON.stringify(payload));
  } catch {
    // localStorage недоступен (приватный режим) — черновик живёт в сессии.
  }
}

function clearDraft(workflowId: string): void {
  try {
    localStorage.removeItem(draftKey(workflowId));
  } catch {
    /* noop */
  }
}

/** Фабрика стора на маршрут (черновик персистится на каждый документ-шаг). */
export function createRouteDocStore(workflowId: string) {
  return create<RouteDocState>()((set, get) => ({
    workflowId,
    baseVersion: 1,
    document: { stages: [], transitions: [] },
    baseline: { stages: [], transitions: [] },
    selection: null,
    dirty: false,
    past: [],
    future: [],
    draftSavedAt: null,

    load: (detail) => {
      const baseline: WorkflowDraftDocument = {
        stages: detail.document.stages.map((s) => ({ ...s })),
        transitions: detail.document.transitions.map((t) => ({ ...t })),
      };
      const draft = readDraft(detail.id, detail.version);
      set({
        workflowId: detail.id,
        baseVersion: detail.version,
        baseline,
        // Черновик той же версии подхватывается сразу (баннер предлагает
        // «Сбросить»); устаревший — игнорируется.
        document: draft?.document ?? baseline,
        draftSavedAt: draft?.savedAt ?? null,
        selection: null,
        dirty: draft !== null,
        past: [],
        future: [],
      });
    },

    select: (ref) => set({ selection: ref }),

    addStage: (band) => {
      const id = newId();
      set((s) => {
        const stage: WorkflowDraftStage = {
          id,
          code: null,
          name: ui.automation.newStageName,
          color: 'neutral',
          systemState: band,
          outcome: null,
          isInitial: s.document.stages.every((st) => !st.isInitial) && band === 'backlog',
          sortOrder: 0,
        };
        const next = normalize({ ...s.document, stages: [...s.document.stages, stage] });
        return { ...withHistory(s, next), selection: { kind: 'stage', id } };
      });
      persistDraft(get());
      return id;
    },

    patchStage: (id, patch) => {
      set((s) => {
        let touched = s.document.stages.map((st) => (st.id === id ? { ...st, ...patch } : st));
        // Один начальный: включение переносит флаг с прежнего.
        if (patch.isInitial === true) {
          touched = touched.map((st) => ({ ...st, isInitial: st.id === id }));
        }
        const next = normalize({ ...s.document, stages: touched });
        return withHistory(s, next);
      });
      persistDraft(get());
    },

    moveStage: (id, targetIndex) => {
      set((s) => {
        const stage = s.document.stages.find((st) => st.id === id);
        if (!stage) return {};
        const band = s.document.stages.filter(
          (st) => st.systemState === stage.systemState && st.id !== id,
        );
        const clamped = Math.max(0, Math.min(band.length, targetIndex));
        band.splice(clamped, 0, { ...stage });
        const byId = new Map(band.map((st) => [st.id, st]));
        const stages = s.document.stages.map((st) => byId.get(st.id) ?? st);
        return withHistory(s, normalize({ ...s.document, stages }));
      });
      persistDraft(get());
    },

    removeStage: (id) => {
      set((s) => {
        const stages = s.document.stages.filter((st) => st.id !== id);
        const transitions = s.document.transitions.filter(
          (t) => t.fromStageId !== id && t.toStageId !== id,
        );
        const next = normalize({ stages, transitions });
        return {
          ...withHistory(s, next),
          selection: s.selection?.kind === 'stage' && s.selection.id === id ? null : s.selection,
        };
      });
      persistDraft(get());
    },

    addTransition: (from, to) => {
      const state = get();
      const target = state.document.stages.find((st) => st.id === to);
      if (!target || from === to) return null;
      const id = newId();
      const maxOrder = Math.max(0, ...state.document.transitions.map((t) => t.sortOrder)) + 1;
      const transition: WorkflowDraftTransition = {
        id,
        code: null,
        name: target.name,
        fromStageId: from,
        toStageId: to,
        display: 'button',
        sortOrder: maxOrder,
        rules: {
          conditions: [{ kind: 'role_in', roles: ['assignee'] }],
          validators: [],
          postFunctions: [],
        },
      };
      set((s) => ({
        ...withHistory(s, { ...s.document, transitions: [...s.document.transitions, transition] }),
        selection: { kind: 'transition', id },
      }));
      persistDraft(get());
      return id;
    },

    patchTransition: (id, patch) => {
      set((s) => {
        const transitions = s.document.transitions.map((t) =>
          t.id === id ? { ...t, ...patch } : t,
        );
        return withHistory(s, { ...s.document, transitions });
      });
      persistDraft(get());
    },

    setTransitionPrimary: (id) => {
      set((s) => {
        const target = s.document.transitions.find((t) => t.id === id);
        if (!target) return {};
        const transitions = s.document.transitions.map((t) => {
          if (t.id === id) return { ...t, display: 'primary' as TransitionDisplay };
          // Прежняя главная этого статуса становится «Видна».
          if (t.display === 'primary' && (t.fromStageId ?? null) === (target.fromStageId ?? null)) {
            return { ...t, display: 'button' as TransitionDisplay };
          }
          return t;
        });
        return withHistory(s, { ...s.document, transitions });
      });
      persistDraft(get());
    },

    removeTransition: (id) => {
      set((s) => {
        const transitions = s.document.transitions.filter((t) => t.id !== id);
        return {
          ...withHistory(s, { ...s.document, transitions }),
          selection:
            s.selection?.kind === 'transition' && s.selection.id === id ? null : s.selection,
        };
      });
      persistDraft(get());
    },

    /** Порядок кнопок внутри статуса (sortOrder переназначается группе). */
    moveTransition: (id, targetIndex) => {
      set((s) => {
        const target = s.document.transitions.find((t) => t.id === id);
        if (!target) return {};
        const group = s.document.transitions
          .filter((t) => (t.fromStageId ?? null) === (target.fromStageId ?? null))
          .sort((a, b) => a.sortOrder - b.sortOrder);
        const from = group.indexOf(target);
        const to = Math.max(0, Math.min(group.length - 1, targetIndex));
        if (from === to) return {};
        group.splice(to, 0, ...group.splice(from, 1));
        const order = new Map(group.map((t, i) => [t.id, i]));
        const transitions = s.document.transitions.map((t) =>
          order.has(t.id) ? { ...t, sortOrder: order.get(t.id)! } : t,
        );
        return withHistory(s, { ...s.document, transitions });
      });
      persistDraft(get());
    },

    undo: () => {
      set((s) => {
        const previous = s.past[s.past.length - 1];
        if (!previous) return {};
        return {
          document: previous,
          past: s.past.slice(0, -1),
          future: [s.document, ...s.future].slice(0, HISTORY_LIMIT),
          dirty: JSON.stringify(previous) !== JSON.stringify(s.baseline),
        };
      });
      persistDraft(get());
    },

    redo: () => {
      set((s) => {
        const [next, ...rest] = s.future;
        if (!next) return {};
        return {
          document: next,
          past: [...s.past, s.document].slice(-HISTORY_LIMIT),
          future: rest,
          dirty: JSON.stringify(next) !== JSON.stringify(s.baseline),
        };
      });
      persistDraft(get());
    },

    discard: () => {
      set((s) => ({
        document: s.baseline,
        dirty: false,
        past: [],
        future: [],
        draftSavedAt: null,
        selection: null,
      }));
      clearDraft(get().workflowId);
    },

    markPublished: (version) => {
      set((s) => ({
        baseVersion: version,
        baseline: s.document,
        dirty: false,
        past: [],
        future: [],
        draftSavedAt: null,
      }));
      clearDraft(get().workflowId);
    },
  }));
}

/** Единственный экземпляр стора: редактор один на экран, смена типа — load(). */
export const useRouteDocStore = createRouteDocStore('pending');
