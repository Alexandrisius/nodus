import type {
  WorkflowDraftDocument,
  WorkflowDraftStage,
  WorkflowDraftTransition,
  WorkflowProblem,
} from './workflow-document.schemas.js';

/**
 * Проверка документа маршрута (#378, ADR-0021) — чистая функция без
 * состояния и I/O; работает и в редакторе (живые подсказки), и на сервере
 * (публикация отклоняется при ошибках). Это исключение из «без логики в
 * contracts» (patterns.md): грамматика документа обязана совпадать
 * байт-в-байт на фронте и бэке.
 */

const MAX_STAGES = 20;
const MAX_TRANSITIONS = 80;

function error(
  code: WorkflowProblem['code'],
  refs: Pick<WorkflowProblem, 'stageId' | 'transitionId'> = {},
): WorkflowProblem {
  return { code, severity: 'error', ...refs };
}

function warning(
  code: WorkflowProblem['code'],
  refs: Pick<WorkflowProblem, 'stageId' | 'transitionId'> = {},
): WorkflowProblem {
  return { code, severity: 'warning', ...refs };
}

/** Переходы, которыми можно ВЫЙТИ из стадии: свои + «из любого». Для
 *  незамкнутых стадий (только их проверяет dead_end) любое «из любого» —
 *  выход; правило «итог → итог» (ADR-0020 дополнение) гасит «из любого»
 *  лишь между двумя закрытыми стадиями — это учтено в closed_without_exit. */
function exitsFrom(stage: WorkflowDraftStage, transitions: readonly WorkflowDraftTransition[]) {
  return transitions.filter((t) => t.fromStageId === stage.id || t.fromStageId === null);
}

/**
 * Живые проверки схемы. Ошибки запрещают публикацию, предупреждения — нет.
 * Порядок детерминирован: правила по порядку таблицы спеки, элементы — по
 * массиву документа (устойчивые подсказки в UI).
 */
export function checkWorkflowDocument(doc: WorkflowDraftDocument): WorkflowProblem[] {
  const { stages, transitions } = doc;
  const problems: WorkflowProblem[] = [];
  const byId = new Map(stages.map((s) => [s.id as string, s]));

  // --- Структура -----------------------------------------------------------

  if (stages.length > MAX_STAGES) problems.push(error('too_many_stages'));
  if (transitions.length > MAX_TRANSITIONS) problems.push(error('too_many_transitions'));

  const initialStages = stages.filter((s) => s.isInitial);
  if (initialStages.length === 0) problems.push(error('no_initial'));
  if (initialStages.length > 1) problems.push(error('multiple_initial'));

  // --- Имена и дубликаты ---------------------------------------------------

  for (const s of stages) {
    if (s.name.trim().length === 0) problems.push(error('empty_name', { stageId: s.id }));
  }
  for (const t of transitions) {
    if (t.name.trim().length === 0) problems.push(error('empty_name', { transitionId: t.id }));
  }

  const seenStageNames = new Set<string>();
  for (const s of stages) {
    const key = s.name.trim().toLowerCase();
    if (key.length === 0) continue;
    if (seenStageNames.has(key)) problems.push(error('duplicate_stage_name', { stageId: s.id }));
    seenStageNames.add(key);
  }

  // «Видимые» кнопки (не в меню) из одного статуса с одним названием.
  const seenButtonKeys = new Set<string>();
  for (const t of transitions) {
    const name = t.name.trim().toLowerCase();
    if (name.length === 0 || t.display === 'menu') continue;
    const key = `${t.fromStageId ?? '*'}→${name}`;
    if (seenButtonKeys.has(key)) {
      problems.push(error('duplicate_button_name', { transitionId: t.id }));
    }
    seenButtonKeys.add(key);
  }

  // --- Кнопки: петли, роли, главные, route_if ------------------------------

  for (const t of transitions) {
    if (t.fromStageId !== null && t.fromStageId === t.toStageId) {
      problems.push(error('self_loop', { transitionId: t.id }));
    }
    if (t.rules.conditions.length === 0) {
      problems.push(error('no_roles', { transitionId: t.id }));
    }
  }

  const seenPrimary = new Set<string>();
  for (const t of [...transitions].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (t.display !== 'primary') continue;
    const key = t.fromStageId ?? '*';
    if (seenPrimary.has(key)) problems.push(error('multiple_primary', { transitionId: t.id }));
    seenPrimary.add(key);
  }

  for (const t of transitions) {
    for (const pf of t.rules.postFunctions) {
      if (pf.kind !== 'route_if') continue;
      const targetExists = byId.has(pf.toStageId);
      const sameAsDirect = pf.toStageId === t.toStageId;
      if (!targetExists || sameAsDirect) {
        problems.push(error('route_if_invalid', { transitionId: t.id }));
      }
    }
  }

  // --- Окно при нажатии (#380) --------------------------------------------

  for (const t of transitions) {
    const form = t.form;
    if (!form?.enabled) continue;
    const kinds = new Set<string>();
    for (const section of form.sections) {
      if (kinds.has(section.kind)) {
        problems.push(error('form_duplicate_section', { transitionId: t.id }));
      }
      kinds.add(section.kind);
      if (
        (section.kind === 'result_files' || section.kind === 'comment') &&
        section.label.trim().length === 0
      ) {
        problems.push(error('form_empty_label', { transitionId: t.id }));
      }
    }
    const hasResult = kinds.has('result');
    const files = form.sections.find((s) => s.kind === 'result_files');
    const hasFilesGate = t.rules.validators.some((v) => v.kind === 'result_files');
    if (files && !hasFilesGate && !hasResult) {
      problems.push(warning('form_useless_section', { transitionId: t.id }));
    }
    const messages = form.sections.find((s) => s.kind === 'result_messages');
    if (messages?.kind === 'result_messages' && !messages.required && !hasResult) {
      problems.push(warning('form_useless_section', { transitionId: t.id }));
    }
  }

  // --- Итог ----------------------------------------------------------------

  for (const s of stages) {
    const hasOutcome = s.outcome !== null;
    if (s.systemState === 'closed' && !hasOutcome) {
      problems.push(error('outcome_mismatch', { stageId: s.id }));
    }
    if (s.systemState !== 'closed' && hasOutcome) {
      problems.push(error('outcome_mismatch', { stageId: s.id }));
    }
  }

  // --- Достижимость и тупики ----------------------------------------------

  // Рёбра для BFS: свои переходы + «из любого» (правило «итог → итог» гасит
  // «из любого» между двумя закрытыми стадиями — такой путь не проходим).
  const neighbors = (stage: WorkflowDraftStage): string[] => {
    const result: string[] = [];
    for (const t of transitions) {
      if (t.fromStageId === stage.id) {
        result.push(t.toStageId);
      } else if (t.fromStageId === null) {
        const target = byId.get(t.toStageId);
        if (!(stage.systemState === 'closed' && target?.systemState === 'closed')) {
          result.push(t.toStageId);
        }
      }
    }
    return result;
  };

  const initial = initialStages.length === 1 ? initialStages[0] : null;
  if (initial) {
    const reachable = new Set<string>([initial.id]);
    const queue = [initial];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const nextId of neighbors(current)) {
        if (!reachable.has(nextId)) {
          reachable.add(nextId);
          const next = byId.get(nextId);
          if (next) queue.push(next);
        }
      }
    }
    for (const s of stages) {
      if (!reachable.has(s.id)) problems.push(error('unreachable_stage', { stageId: s.id }));
    }
    const canClose = stages.some((s) => s.systemState === 'closed' && reachable.has(s.id));
    if (!canClose) problems.push(error('no_closed_stage'));
  }

  for (const s of stages) {
    if (s.systemState === 'closed') continue;
    if (exitsFrom(s, transitions).length === 0) {
      problems.push(error('dead_end_stage', { stageId: s.id }));
    }
  }

  // --- Предупреждения ------------------------------------------------------

  for (const s of stages) {
    // Закрытые статусы не штрафуются: у «Итога» нет пути вперёд, их
    // собственное предупреждение — closed_without_exit.
    if (s.systemState === 'closed') continue;
    const own = transitions.filter((t) => t.fromStageId === s.id);
    if (own.length > 0 && !own.some((t) => t.display === 'primary')) {
      problems.push(warning('no_primary', { stageId: s.id }));
    }
  }

  for (const s of stages) {
    if (s.systemState !== 'closed') continue;
    const hasExit = transitions.some(
      (t) =>
        t.fromStageId === s.id ||
        // «из любого» возвращает из итога, только если цель открыта.
        (t.fromStageId === null && byId.get(t.toStageId)?.systemState !== 'closed'),
    );
    if (!hasExit) problems.push(warning('closed_without_exit', { stageId: s.id }));
  }

  const anyTargets = new Set(
    transitions.filter((t) => t.fromStageId === null).map((t) => t.toStageId),
  );
  for (const t of transitions) {
    if (t.fromStageId !== null && anyTargets.has(t.toStageId)) {
      problems.push(warning('duplicate_with_any', { transitionId: t.id }));
    }
  }

  return problems;
}

/** Есть ли ошибки, запрещающие публикацию. */
export function hasBlockingProblems(problems: readonly WorkflowProblem[]): boolean {
  return problems.some((p) => p.severity === 'error');
}
