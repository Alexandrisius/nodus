import type { WorkflowDocument, WorkflowMigration } from '@nodus/contracts';

/**
 * Публикация в моке — как сервер (publish-planner `resolveDocId`/
 * `resolveRules`): черновые `new:*` статусы и кнопки получают постоянные id,
 * ссылки на них (откуда/куда, цели route_if, ключи раскладки, цели переносов)
 * переписываются. Иначе вторая публикация в той же сессии повторила бы
 * `new:*` и мок разошёлся бы с сервером.
 */
export function resolvePublishedDocument(
  document: WorkflowDocument,
  migrations: readonly WorkflowMigration[],
  nextId: () => string,
): { document: WorkflowDocument; migrations: WorkflowMigration[] } {
  const ids = new Map<string, string>();
  const resolve = (id: string): string => {
    if (!id.startsWith('new:')) return id;
    const known = ids.get(id);
    if (known) return known;
    const fresh = nextId();
    ids.set(id, fresh);
    return fresh;
  };
  const stages = document.stages.map((s) => ({ ...s, id: resolve(s.id) }));
  const transitions = document.transitions.map((t) => ({
    ...t,
    id: resolve(t.id),
    fromStageId: t.fromStageId === null ? null : resolve(t.fromStageId),
    toStageId: resolve(t.toStageId),
    rules: {
      ...t.rules,
      postFunctions: t.rules.postFunctions.map((p) =>
        p.kind === 'route_if' ? { ...p, toStageId: resolve(p.toStageId) } : p,
      ),
    },
  }));
  const layout = document.layout && {
    stages: Object.fromEntries(
      Object.entries(document.layout.stages).map(([id, point]) => [resolve(id), point]),
    ),
    transitions: Object.fromEntries(
      Object.entries(document.layout.transitions).map(([id, edge]) => [resolve(id), edge]),
    ),
  };
  return {
    document: { stages, transitions, ...(layout ? { layout } : {}) },
    migrations: migrations.map((m) => ({ ...m, toStageId: resolve(m.toStageId) })),
  };
}
