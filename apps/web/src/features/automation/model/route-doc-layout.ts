import type {
  WorkflowDraftDocument,
  WorkflowLayout,
  WorkflowLayoutTransition,
} from '@nodus/contracts';

import { freeDepth, type Placed } from '../../../shared/flow/route-loops.js';
import {
  frozenLayout,
  isLayoutComplete,
  resolveRoute,
} from '../../../shared/flow/route-resolve.js';
import { layoutOf, pruneLayout } from './route-doc-ops.js';

/**
 * Сопровождение раскладки на каждом шаге документа (#378 ред. 2): фиксация
 * видимой картинки, глубины сдвинутых обходов, места подписей. Порядок в
 * шаге истории: freezeLayout → settleLoops → settleLabels.
 */

/**
 * «Что видишь — то и стоит»: правка документа фиксирует видимую картинку
 * предыдущего шага — позиции всех статусов и точки всех стрелок. Иначе
 * перетаскивание одного статуса (или любая правка) переставляло остальные
 * авторасстановкой и перестраивало чужие стрелки. Явные значения нового шага
 * главнее; у стрелки со сменённым концом точка этого конца не переносится.
 * Вернуть авторасстановку — только «Упорядочить».
 */
export function freezeLayout(
  prev: WorkflowDraftDocument,
  next: WorkflowDraftDocument,
): WorkflowDraftDocument {
  if (isLayoutComplete(prev)) return next;
  const frozen = frozenLayout(prev);
  const layout = layoutOf(next);
  const before = new Map(prev.transitions.map((t) => [t.id, t]));
  const transitions: WorkflowLayout['transitions'] = { ...layout.transitions };
  for (const t of next.transitions) {
    const old = before.get(t.id);
    const pinned = frozen.transitions[t.id];
    if (!old || !pinned) continue;
    const keep: WorkflowLayoutTransition = {};
    if (old.fromStageId === t.fromStageId && pinned.sourceHandle) {
      keep.sourceHandle = pinned.sourceHandle;
    }
    if (old.toStageId === t.toStageId && pinned.targetHandle) {
      keep.targetHandle = pinned.targetHandle;
    }
    const endsKept = (t.fromStageId === null || keep.sourceHandle) && keep.targetHandle;
    if (endsKept && pinned.offset !== undefined) keep.offset = pinned.offset;
    if (pinned.labelT !== undefined) keep.labelT = pinned.labelT;
    transitions[t.id] = { ...keep, ...layout.transitions[t.id] };
  }
  return pruneLayout({
    ...next,
    layout: { stages: { ...frozen.stages, ...layout.stages }, transitions },
  });
}

/**
 * Обходы, чьи концы сдвинулись этим шагом (перетаскивание статуса или метки,
 * перенос конца стрелки), держат свою глубину, а при наложении на соседний
 * обход или проходе сквозь карточку уходят на ступень глубже. Обходы,
 * которых шаг не касался, не меняются никогда — «фантомных» перестроений
 * чужих стрелок нет.
 */
export function settleLoops(
  prev: WorkflowDraftDocument,
  next: WorkflowDraftDocument,
): WorkflowDraftDocument {
  const before = resolveRoute(prev);
  const after = resolveRoute(next);
  const moved = [...after.loops.keys()].filter((id) => before.ends.get(id) !== after.ends.get(id));
  if (moved.length === 0) return next;
  const touched = new Set(moved);
  const placed: Placed[] = [...after.loops.values()]
    .filter((loop) => !touched.has(loop.id))
    .map((loop) => ({ loop, offset: after.spread.get(loop.id)!.offset }));
  const layout = layoutOf(next);
  const transitions = { ...layout.transitions };
  for (const id of moved) {
    const loop = after.loops.get(id)!;
    const offset = freeDepth(loop, after.spread.get(id)!.offset, placed, after.nodeBoxes);
    placed.push({ loop, offset });
    transitions[id] = { ...transitions[id], offset };
  }
  return { ...next, layout: { ...layout, transitions } };
}

/**
 * Подписи после шага: в документ ложится ровно та картинка, что на холсте
 * (`resolveRoute` наездов не допускает). Уступают подписи стрелок, которые
 * этим шагом сдвинули (их путь изменился): держат свою долю, а если теперь
 * наезжают на узел или чужую подпись — переезжают на ближайшее свободное
 * место СВОЕЙ стрелки. Подписи несдвинутых стрелок не трогаются, кроме
 * одной, на которую положили узел (иначе её не видно).
 */
export function settleLabels(
  prev: WorkflowDraftDocument,
  next: WorkflowDraftDocument,
): WorkflowDraftDocument {
  const before = resolveRoute(prev);
  const pathOf = (route: typeof before, id: string) => JSON.stringify(route.paths.get(id));
  const probe = resolveRoute(next);
  const moved = new Set(
    next.transitions
      .filter((t) => probe.paths.has(t.id) && pathOf(before, t.id) !== pathOf(probe, t.id))
      .map((t) => t.id),
  );
  const after = resolveRoute(next, { yieldLabels: moved });
  const layout = layoutOf(next);
  let transitions: WorkflowLayout['transitions'] | null = null;
  for (const [id, t] of after.labels) {
    if (layout.transitions[id]?.labelT === t) continue;
    transitions ??= { ...layout.transitions };
    transitions[id] = { ...transitions[id], labelT: t };
  }
  return transitions ? { ...next, layout: { ...layout, transitions } } : next;
}

const EMPTY: WorkflowLayout = { stages: {}, transitions: {} };

/**
 * Что из расстановки уходит автосохранением: места ОПУБЛИКОВАННЫХ элементов
 * (места новых — с их публикацией). Элемент, удалённый в черновике, держит
 * сохранённое место — «Сбросить» вернёт его туда же.
 */
export function persistedLayout(
  doc: WorkflowDraftDocument,
  baseline: WorkflowDraftDocument,
): WorkflowLayout {
  const own = doc.layout ?? EMPTY;
  const saved = baseline.layout ?? EMPTY;
  const stages: WorkflowLayout['stages'] = {};
  for (const { id } of baseline.stages) {
    const point = own.stages[id] ?? saved.stages[id];
    if (point) stages[id] = point;
  }
  const transitions: WorkflowLayout['transitions'] = {};
  for (const { id } of baseline.transitions) {
    const entry = own.transitions[id] ?? saved.transitions[id];
    if (entry) transitions[id] = entry;
  }
  return { stages, transitions };
}

/** Ключ значения без учёта порядка ключей объектов (jsonb их переставляет). */
function stableKey(value: unknown): string {
  const sorted = (v: unknown): unknown =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((key) => [key, sorted((v as Record<string, unknown>)[key])]),
        )
      : v;
  return JSON.stringify(sorted(value) ?? null);
}

/** Отпечаток раскладки без учёта порядка ключей (jsonb их переставляет). */
export function layoutFingerprint(layout: WorkflowLayout | undefined): string {
  return stableKey(layout ?? EMPTY);
}

/**
 * Чужая сохранённая расстановка в открытом редакторе (та же версия,
 * `task.workflow_layout_changed`): записи сервера приходят в документ, кроме
 * тех, что здесь изменены и ещё не отправлены (отличаются от прошлой
 * сохранённой) — их отправит автосохранение.
 */
export function adoptSavedLayout(
  own: WorkflowLayout | undefined,
  prevSaved: WorkflowLayout | undefined,
  server: WorkflowLayout,
): WorkflowLayout {
  const mine = own ?? EMPTY;
  const before = prevSaved ?? EMPTY;
  const adopt = <T>(
    ownMap: Record<string, T>,
    prevMap: Record<string, T>,
    serverMap: Record<string, T>,
  ) => {
    const out = { ...ownMap };
    for (const [id, entry] of Object.entries(serverMap)) {
      if (ownMap[id] === undefined || stableKey(ownMap[id]) === stableKey(prevMap[id]))
        out[id] = entry;
    }
    return out;
  };
  return {
    stages: adopt(mine.stages, before.stages, server.stages),
    transitions: adopt(mine.transitions, before.transitions, server.transitions),
  };
}
