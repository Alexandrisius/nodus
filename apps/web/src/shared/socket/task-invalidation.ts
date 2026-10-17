import type { QueryClient } from '@tanstack/react-query';
import { TASK_EVENTS, type Paginated, type TaskListItem } from '@nodus/contracts';

import { tasksKeys } from '../api/tasks-keys.js';
import { stageIdOfColumnKey } from '../lib/board/kanban-column-key.js';
import type { KeyBatcher } from './invalidation-batcher.js';

/** Задача могла ВПЕРВЫЕ появиться на доске (или исчезнуть из догруженной
 *  страницы) в колонке, которую событие не называет: точечно не вычислить —
 *  доска перезапрашивается целиком (редкие события). */
const UNKNOWN_COLUMN_EVENTS = new Set<string>([
  TASK_EVENTS.CREATED,
  TASK_EVENTS.ASSIGNED,
  TASK_EVENTS.PARTICIPANTS_CHANGED,
  TASK_EVENTS.DELETED,
]);

/** События, меняющие раскладку по колонкам или «просрочено» — счётчики
 *  шапок «n из m» и каталоги стадий; правки содержимого карточки их не трогают. */
const COUNT_EVENTS = new Set<string>([
  ...UNKNOWN_COLUMN_EVENTS,
  TASK_EVENTS.STAGE_CHANGED,
  TASK_EVENTS.STATUS_CHANGED,
  TASK_EVENTS.PERSONAL_STAGE_CHANGED,
  TASK_EVENTS.COMPLETED,
  TASK_EVENTS.OVERDUE,
]);

const stringsOf = (...values: unknown[]): string[] =>
  values.filter((v): v is string => typeof v === 'string');

/**
 * Колонки досок под событие задачи (#322): та, где карточка лежит сейчас
 * (по кэшу первых страниц), и те, куда она пришла (`toStageId`/`fromStageId`
 * глобальной оси, `stageId` личной). Колонка — отдельный запрос
 * (`kanbanColumnKey`), поэтому событие у открытой доски — 1–2 запроса.
 */
function pushKanbanKeys(
  batcher: KeyBatcher,
  queryClient: QueryClient,
  type: string,
  taskId: string | null,
  payload: Record<string, unknown>,
): void {
  const targets = new Set(stringsOf(payload.fromStageId, payload.toStageId, payload.stageId));
  let onBoard = false;
  for (const query of queryClient.getQueryCache().findAll({ queryKey: tasksKeys.kanbanAll() })) {
    const stageId = stageIdOfColumnKey(query.queryKey);
    if (!stageId) continue;
    const page = query.state.data as Paginated<TaskListItem> | undefined;
    const holds = taskId !== null && (page?.items.some((t) => t.id === taskId) ?? false);
    onBoard ||= holds;
    if (holds || targets.has(stageId)) batcher.push(query.queryKey, 'list');
  }
  if (UNKNOWN_COLUMN_EVENTS.has(type) && !(type === TASK_EVENTS.DELETED && onBoard)) {
    batcher.push(tasksKeys.kanbanAll(), 'list');
  }
}

/** Ключи кэша задач по событию `task.*` (#311). Сервер шлёт событие
 *  аудитории задачи (user-комнаты, gateway fanout #37) — включая актёра:
 *  собственная мутация уже инвалидировала то же самое, батчер схлопнет
 *  повтор в окне. Личные стадии «Моего плана» — только доска и каталог. */
export function pushTaskKeys(
  batcher: KeyBatcher,
  queryClient: QueryClient,
  type: string,
  payload: Record<string, unknown>,
): void {
  const taskId = typeof payload.taskId === 'string' ? payload.taskId : null;
  if (type.startsWith('task.personal_stage_') && type !== TASK_EVENTS.PERSONAL_STAGE_CHANGED) {
    batcher.push(tasksKeys.personalStages(), 'list');
    batcher.push(tasksKeys.kanbanAll(), 'list');
    return;
  }
  if (taskId) {
    batcher.push(tasksKeys.detail(taskId), 'feed');
    batcher.push(tasksKeys.transitions(taskId), 'feed');
    if (type.startsWith('task.time') || type.startsWith('task.timer')) {
      batcher.push(tasksKeys.timeEntries(taskId), 'feed');
      batcher.push(tasksKeys.timer(), 'feed');
    }
    // Связь меняет обе карточки: сервер шлёт relation_changed по каждой
    // стороне со своей аудиторией (#317) — список связей живёт отдельным ключом.
    if (type === TASK_EVENTS.RELATION_CHANGED) {
      batcher.push(tasksKeys.relations(taskId), 'feed');
    }
  }
  pushKanbanKeys(batcher, queryClient, type, taskId, payload);
  const fields = Array.isArray(payload.fields) ? payload.fields : [];
  if (COUNT_EVENTS.has(type) || (type === TASK_EVENTS.UPDATED && fields.includes('deadline'))) {
    batcher.push(tasksKeys.personalStages(), 'list');
    batcher.push(tasksKeys.stages(), 'list');
  }
  // Журнал и навигатор веток рефечатся, только если смонтированы (active).
  batcher.push(tasksKeys.listPages(), 'list');
  batcher.push(tasksKeys.branchAll(), 'list');
}
