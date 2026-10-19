import type { QueryClient } from '@tanstack/react-query';
import { TASK_EVENTS, type Paginated, type TaskListItem } from '@nodus/contracts';

import { tasksKeys } from '../api/tasks-keys.js';
import { automationKeys } from '../api/automation-keys.js';
import { stageIdOfColumnKey } from '../lib/board/kanban-column-key.js';
import { workflowKeys } from '../workflow/workflow-api.js';
import type { KeyBatcher } from './invalidation-batcher.js';

/** Каталожные события библиотеки типов (#378): рассылаются всем —
 *  инвалидируются каталоги (типы, стадии, маршруты) и переходы всех задач
 *  (кнопки зависят от маршрута). */
const CATALOG_EVENTS = new Set<string>([
  TASK_EVENTS.TYPE_CREATED,
  TASK_EVENTS.TYPE_UPDATED,
  TASK_EVENTS.TYPE_ARCHIVED,
  TASK_EVENTS.WORKFLOW_PUBLISHED,
]);

/** Задача могла ВПЕРВЫЕ появиться на доске в колонке, которую событие не
 *  называет: точечно не вычислить — доски перезапрашиваются целиком (редкие
 *  события: новая задача, смена ответственного, новый участник). */
const NEW_ON_BOARD_EVENTS = new Set<string>([
  TASK_EVENTS.CREATED,
  TASK_EVENTS.ASSIGNED,
  TASK_EVENTS.PARTICIPANTS_CHANGED,
]);

/** События, меняющие раскладку по колонкам или «просрочено» — счётчики
 *  шапок «n из m» и каталоги стадий; правки содержимого карточки их не трогают. */
const COUNT_EVENTS = new Set<string>([
  ...NEW_ON_BOARD_EVENTS,
  TASK_EVENTS.DELETED,
  TASK_EVENTS.STAGE_CHANGED,
  TASK_EVENTS.STATUS_CHANGED,
  TASK_EVENTS.PERSONAL_STAGE_CHANGED,
  TASK_EVENTS.COMPLETED,
  TASK_EVENTS.OVERDUE,
]);

const stringsOf = (...values: unknown[]): string[] =>
  values.filter((v): v is string => typeof v === 'string');

interface ColumnInCache {
  key: readonly unknown[];
  stageId: string;
  page: Paginated<TaskListItem> | undefined;
}

/** Колонки досок в кэше, сгруппированные по доске (ключ доски = ключ колонки
 *  без хвоста `'column', stageId`). */
function boardsInCache(queryClient: QueryClient): Map<string, ColumnInCache[]> {
  const boards = new Map<string, ColumnInCache[]>();
  for (const query of queryClient.getQueryCache().findAll({ queryKey: tasksKeys.kanbanAll() })) {
    const stageId = stageIdOfColumnKey(query.queryKey);
    if (!stageId) continue;
    const board = JSON.stringify(query.queryKey.slice(0, -2));
    const columns = boards.get(board) ?? [];
    columns.push({
      key: query.queryKey,
      stageId,
      page: query.state.data as Paginated<TaskListItem> | undefined,
    });
    boards.set(board, columns);
  }
  return boards;
}

/**
 * Колонки досок под событие задачи (#322), по каждой доске отдельно: та, где
 * карточка лежит (по кэшу первых страниц), и те, куда она пришла
 * (`toStageId`/`fromStageId` глобальной оси, `stageId` личной). Не нашлась
 * в первых страницах доски — она может быть только в догруженной странице
 * колонки с продолжением (`nextCursor`): перезапрашиваются такие колонки
 * (догрузка колонки в кэш не попадает — живёт в борде). Колонка — отдельный
 * запрос (`kanbanColumnKey`): событие у открытой доски — 1–2 запроса.
 */
function pushKanbanKeys(
  batcher: KeyBatcher,
  queryClient: QueryClient,
  type: string,
  taskId: string | null,
  payload: Record<string, unknown>,
): void {
  if (NEW_ON_BOARD_EVENTS.has(type)) {
    batcher.push(tasksKeys.kanbanAll(), 'list');
    return;
  }
  const targets = new Set(stringsOf(payload.fromStageId, payload.toStageId, payload.stageId));
  for (const columns of boardsInCache(queryClient).values()) {
    const holds = (c: ColumnInCache) =>
      taskId !== null && (c.page?.items.some((t) => t.id === taskId) ?? false);
    const onBoard = columns.some(holds);
    for (const column of columns) {
      const mayHide = !onBoard && taskId !== null && Boolean(column.page?.nextCursor);
      if (holds(column) || targets.has(column.stageId) || mayHide) {
        batcher.push(column.key, 'list');
      }
    }
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
  // Каталожные события: каталоги типов/стадий/маршрутов и переходы всех задач.
  if (CATALOG_EVENTS.has(type)) {
    batcher.push(automationKeys.all, 'list');
    batcher.push(workflowKeys.all, 'list');
    batcher.push(tasksKeys.types(), 'list');
    batcher.push(tasksKeys.stages(), 'list');
    batcher.push([tasksKeys.all[0], 'transitions'], 'list');
    batcher.push(tasksKeys.listPages(), 'list');
    return;
  }
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
