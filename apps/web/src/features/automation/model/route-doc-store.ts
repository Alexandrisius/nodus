import { create } from 'zustand';
import type {
  TaskSystemState,
  TransitionDisplay,
  WorkflowDetail,
  WorkflowDraftDocument,
  WorkflowDraftStage,
  WorkflowDraftTransition,
} from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { clearDraft, persistDraft, readDraft, readStaleDraft } from './route-draft-storage.js';
import { newId, normalize, stepHistory, withHistory } from './route-doc-helpers.js';

/** Стор рабочей копии маршрута (#378, ADR-0021): документ, история-снимки,
 *  черновик в localStorage (route-draft-storage), публикация/отмена → сброс
 *  dirty. Ручные позиции статусов на холсте — отдельное поле: раскладка
 *  редактора, в историю undo не попадает и dirty не поднимает. */

export type SelectionRef = { kind: 'stage' | 'transition'; id: string } | null;

export interface StagePosition {
  x: number;
  y: number;
}

interface RouteDocState {
  workflowId: string;
  baseVersion: number;
  document: WorkflowDraftDocument;
  /** Снимок опубликованной версии (сброс dirty = вернуть его). */
  baseline: WorkflowDraftDocument;
  /** Ручные позиции статусов (перетаскивание) — персистятся с черновиком. */
  positions: Record<string, StagePosition>;
  selection: SelectionRef;
  dirty: boolean;
  past: WorkflowDraftDocument[];
  future: WorkflowDraftDocument[];
  /** Когда черновик сохранён (баннер «Продолжить черновик от …»). */
  draftSavedAt: string | null;
  /** Устаревший черновик (версия ушла) — баннер «Черновик устарел». */
  staleDraftAt: string | null;

  load: (detail: WorkflowDetail) => void;
  select: (ref: SelectionRef) => void;

  addStage: (band: TaskSystemState) => string;
  patchStage: (id: string, patch: Partial<Omit<WorkflowDraftStage, 'id' | 'sortOrder'>>) => void;
  moveStage: (id: string, targetIndex: number) => void;
  removeStage: (id: string) => void;
  /** Позиция статуса на холсте: commit=false — живой drag, true — отпускание
   *  (персист черновика). */
  setStagePosition: (id: string, position: StagePosition, commit: boolean) => void;

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

/** Персист черновика текущего состояния стора. */
function commitDraft(state: {
  workflowId: string;
  document: WorkflowDraftDocument;
  baseVersion: number;
  positions: Record<string, StagePosition>;
}): string {
  return persistDraft(state.workflowId, state.document, state.baseVersion, state.positions);
}

/** Фабрика стора на маршрут (черновик персистится на каждый документ-шаг). */
export function createRouteDocStore(workflowId: string) {
  return create<RouteDocState>()((set, get) => ({
    workflowId,
    baseVersion: 1,
    document: { stages: [], transitions: [] },
    baseline: { stages: [], transitions: [] },
    positions: {},
    selection: null,
    dirty: false,
    past: [],
    future: [],
    draftSavedAt: null,
    staleDraftAt: null,

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
        // Черновик той же версии — подхватывается (баннер «Сбросить»);
        // устаревший — игнорируется, но о нём сообщаем (staleDraftAt).
        document: draft?.document ?? baseline,
        positions: draft?.positions ?? {},
        draftSavedAt: draft?.savedAt ?? null,
        staleDraftAt: draft ? null : readStaleDraft(detail.id, detail.version),
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
      commitDraft(get());
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
      commitDraft(get());
    },

    moveStage: (id, targetIndex) => {
      set((s) => {
        const stage = s.document.stages.find((st) => st.id === id);
        if (!stage) return {};
        const peers = s.document.stages.filter(
          (st) => st.systemState === stage.systemState && st.id !== id,
        );
        const clamped = Math.max(0, Math.min(peers.length, targetIndex));
        peers.splice(clamped, 0, { ...stage });
        const byId = new Map(peers.map((st) => [st.id, st]));
        const stages = s.document.stages.map((st) => byId.get(st.id) ?? st);
        return withHistory(s, normalize({ ...s.document, stages }));
      });
      commitDraft(get());
    },

    removeStage: (id) => {
      set((s) => {
        const stages = s.document.stages.filter((st) => st.id !== id);
        const transitions = s.document.transitions.filter(
          (t) => t.fromStageId !== id && t.toStageId !== id,
        );
        const positions = { ...s.positions };
        delete positions[id];
        const next = normalize({ stages, transitions });
        return {
          ...withHistory(s, next),
          positions,
          selection: s.selection?.kind === 'stage' && s.selection.id === id ? null : s.selection,
        };
      });
      commitDraft(get());
    },

    setStagePosition: (id, position, commit) => {
      set((s) => ({ positions: { ...s.positions, [id]: position } }));
      if (commit) commitDraft(get());
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
      commitDraft(get());
      return id;
    },

    patchTransition: (id, patch) => {
      set((s) => {
        const transitions = s.document.transitions.map((t) =>
          t.id === id ? { ...t, ...patch } : t,
        );
        return withHistory(s, { ...s.document, transitions });
      });
      commitDraft(get());
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
      commitDraft(get());
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
      commitDraft(get());
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
      commitDraft(get());
    },

    undo: () => {
      set((s) => {
        const previous = s.past.at(-1);
        if (!previous) return {};
        return stepHistory(s, previous, s.past.slice(0, -1), [s.document, ...s.future]);
      });
      commitDraft(get());
    },

    redo: () => {
      set((s) => {
        const [next, ...rest] = s.future;
        if (!next) return {};
        return stepHistory(s, next, [...s.past, s.document], rest);
      });
      commitDraft(get());
    },

    discard: () => {
      set((s) => ({
        document: s.baseline,
        positions: {},
        dirty: false,
        past: [],
        future: [],
        draftSavedAt: null,
        staleDraftAt: null,
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
