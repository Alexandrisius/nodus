import { workflowLayoutSchema, type WorkflowLayout } from '@nodus/contracts';

/**
 * Раскладка холста маршрута (#378 ред. 2, ADR-0022) — чистые функции:
 * разрешение `new:*` ключей при публикации и фильтр по живым элементам при
 * чтении. Раскладка — представление (не правила): битая/старая запись не
 * ломает маршрут, а превращается в авторасстановку элемента.
 */

const EMPTY: WorkflowLayout = { stages: {}, transitions: {} };

/** Ключи раскладки → uuid (new:* по картам созданных) + только живые. */
export function resolveLayout(
  layout: WorkflowLayout | undefined,
  created: { stages: Map<string, string>; transitions: Map<string, string> },
  live: { stageIds: ReadonlySet<string>; transitionIds: ReadonlySet<string> },
): WorkflowLayout {
  if (!layout) return EMPTY;
  const stageKey = (id: string) => (id.startsWith('new:') ? created.stages.get(id) : id);
  const transitionKey = (id: string) => (id.startsWith('new:') ? created.transitions.get(id) : id);
  const stages: WorkflowLayout['stages'] = {};
  for (const [id, point] of Object.entries(layout.stages)) {
    const key = stageKey(id);
    if (key && live.stageIds.has(key)) stages[key] = point;
  }
  const transitions: WorkflowLayout['transitions'] = {};
  for (const [id, entry] of Object.entries(layout.transitions)) {
    const key = transitionKey(id);
    if (key && live.transitionIds.has(key)) transitions[key] = entry;
  }
  return { stages, transitions };
}

/** Сохранённая раскладка → по живым элементам (чтение редактора/схемы). */
export function liveLayout(
  raw: unknown,
  live: { stageIds: ReadonlySet<string>; transitionIds: ReadonlySet<string> },
): WorkflowLayout {
  const parsed = workflowLayoutSchema.safeParse(raw);
  if (!parsed.success) return EMPTY;
  return resolveLayout(parsed.data, { stages: new Map(), transitions: new Map() }, live);
}
