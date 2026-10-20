import type {
  WorkflowDraftDocument,
  WorkflowDraftTransition,
  WorkflowLayout,
  WorkflowLayoutTransition,
} from '@nodus/contracts';

import {
  labelBoxAt,
  labelCost,
  labelWidth,
  placeLabel,
} from '../../../shared/flow/route-labels.js';
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
 * обход уходят на ступень глубже. Обходы, которых шаг не касался, не меняются
 * никогда — «фантомных» перестроений чужих стрелок нет.
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
    const offset = freeDepth(loop, after.spread.get(id)!.offset, placed);
    placed.push({ loop, offset });
    transitions[id] = { ...transitions[id], offset };
  }
  return { ...next, layout: { ...layout, transitions } };
}

/**
 * Подписи после шага: подпись стрелки, чей путь изменился, держит свою долю,
 * а если теперь наезжает на узел или другую подпись — переезжает на
 * ближайшее свободное место СВОЕЙ стрелки. Подпись неизменной стрелки
 * трогается, только если на неё положили узел (иначе её не видно); место,
 * куда подпись перетащил пользователь, этим шагом не меняется.
 */
export function settleLabels(
  prev: WorkflowDraftDocument,
  next: WorkflowDraftDocument,
): WorkflowDraftDocument {
  const before = resolveRoute(prev);
  const after = resolveRoute(next);
  const named = next.transitions.filter((t) => t.name !== '' && after.paths.has(t.id));
  const pathOf = (route: typeof after, id: string) => JSON.stringify(route.paths.get(id));
  const boxOf = (route: typeof after, t: WorkflowDraftTransition) =>
    labelBoxAt(route.paths.get(t.id)!, route.labels.get(t.id)!, labelWidth(t.name));
  const moving = new Set(
    named
      .filter((t) => {
        if (pathOf(before, t.id) !== pathOf(after, t.id)) return true;
        const coveredNow = labelCost(boxOf(after, t), after.nodeBoxes) > 0;
        return coveredNow && labelCost(boxOf(before, t), before.nodeBoxes) === 0;
      })
      .map((t) => t.id),
  );
  if (moving.size === 0) return next;
  const obstacles = [
    ...after.nodeBoxes,
    ...named.filter((t) => !moving.has(t.id)).map((t) => boxOf(after, t)),
  ];
  const layout = layoutOf(next);
  const transitions = { ...layout.transitions };
  for (const t of named) {
    if (!moving.has(t.id)) continue;
    const points = after.paths.get(t.id)!;
    const width = labelWidth(t.name);
    const current = after.labels.get(t.id)!;
    const free = labelCost(labelBoxAt(points, current, width), obstacles) === 0;
    const at = free ? current : placeLabel(points, width, obstacles, current);
    obstacles.push(labelBoxAt(points, at, width));
    transitions[t.id] = { ...transitions[t.id], labelT: at };
  }
  return { ...next, layout: { ...layout, transitions } };
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

/** Отпечаток раскладки без учёта порядка ключей (jsonb их переставляет). */
export function layoutFingerprint(layout: WorkflowLayout | undefined): string {
  const sorted = (value: unknown): unknown =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, sorted((value as Record<string, unknown>)[key])]),
        )
      : value;
  return JSON.stringify(sorted(layout ?? EMPTY));
}
