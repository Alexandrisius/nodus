import type { WorkflowDetail, WorkflowDraftDocument } from '@nodus/contracts';

import { structureChanged } from './route-doc-helpers.js';
import { adoptSavedLayout, layoutFingerprint } from './route-doc-layout.js';
import { EMPTY_LAYOUT, layoutOf } from './route-doc-ops.js';
import { readDraft, readStaleDraft } from './route-draft-storage.js';

/**
 * Состояние рабочей копии из документа сервера. Черновик той же версии —
 * подхватывается (баннер «Сбросить», если в нём правки маршрута;
 * несохранённую расстановку из него автосохранение отправит само);
 * устаревший — игнорируется, но о нём сообщаем (staleDraftAt).
 */
export function loadedState(detail: WorkflowDetail) {
  const baseline: WorkflowDraftDocument = {
    stages: detail.document.stages.map((s) => ({ ...s })),
    transitions: detail.document.transitions.map((t) => ({ ...t })),
    layout: detail.document.layout ?? EMPTY_LAYOUT,
  };
  const draft = readDraft(detail.id, detail.version);
  const document = draft ? { ...draft.document, layout: layoutOf(draft.document) } : baseline;
  return {
    workflowId: detail.id,
    baseVersion: detail.version,
    baseline,
    document,
    draftSavedAt: draft?.savedAt ?? null,
    staleDraftAt: draft ? null : readStaleDraft(detail.id, detail.version),
    selection: null,
    dirty: structureChanged(document, baseline),
    past: [],
    future: [],
    pendingReload: false,
  };
}

/**
 * Та же версия, сменилась только расстановка (чужое автосохранение,
 * `task.workflow_layout_changed`): общая раскладка приходит в открытый
 * редактор, свои неотправленные места остаются. Шагом истории не считается.
 * `null` — менять нечего.
 */
export function adoptedLayoutState(
  state: { document: WorkflowDraftDocument; baseline: WorkflowDraftDocument },
  detail: WorkflowDetail,
): { document: WorkflowDraftDocument; baseline: WorkflowDraftDocument } | null {
  const server = detail.document.layout;
  if (!server || layoutFingerprint(server) === layoutFingerprint(state.baseline.layout)) {
    return null;
  }
  return {
    baseline: { ...state.baseline, layout: server },
    document: {
      ...state.document,
      layout: adoptSavedLayout(state.document.layout, state.baseline.layout, server),
    },
  };
}
