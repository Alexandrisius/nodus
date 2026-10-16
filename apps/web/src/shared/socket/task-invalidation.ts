import { tasksKeys } from '../api/tasks-keys.js';
import type { KeyBatcher } from './invalidation-batcher.js';

/** Ключи кэша задач по событию `task.*` (#311). Сервер шлёт событие
 *  аудитории задачи (user-комнаты, gateway fanout #37) — включая актёра:
 *  собственная мутация уже инвалидировала то же самое, батчер схлопнет
 *  повтор в окне. Личные стадии «Моего плана» — только доска и каталог. */
export function pushTaskKeys(
  batcher: KeyBatcher,
  type: string,
  payload: Record<string, unknown>,
): void {
  const taskId = typeof payload.taskId === 'string' ? payload.taskId : null;
  if (type.startsWith('task.personal_stage_') && type !== 'task.personal_stage_changed') {
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
    if (type === 'task.relation_changed') {
      batcher.push(tasksKeys.relations(taskId), 'feed');
    }
  }
  batcher.push(tasksKeys.listPages(), 'list');
  batcher.push(tasksKeys.kanbanAll(), 'list');
  batcher.push(tasksKeys.personalStages(), 'list');
  batcher.push(tasksKeys.stages(), 'list');
  batcher.push(tasksKeys.branchAll(), 'list');
}
