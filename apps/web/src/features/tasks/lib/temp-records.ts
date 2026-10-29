import type { AuthUser, TaskDetail, TaskListItem, TaskStage } from '@nodus/contracts';

/**
 * Временные записи оптимистичных мутаций задач (I4, patterns.md): маркер
 * темпа и построение темп-подзадачи. Пока запись темп, действия по её id
 * (открыть, отметить, удалить) заблокированы — сервер такого id не знает.
 */

/** Префикс id временной записи (patterns.md: `temp-<uuid>`). */
export const TEMP_PREFIX = 'temp-';

export function isTempId(id: string): boolean {
  return id.startsWith(TEMP_PREFIX);
}

/** Номер ещё не выдан сервером: `number` темпа — 0 (контракт требует ≥ 1
 *  только у серверных записей); UI вместо номера показывает плейсхолдер. */
export const TEMP_NUMBER = 0;

/** Начальная стадия новой задачи по кэшу каталога: сервер ставит начальную
 *  стадию маршрута (открытое состояние, backlog первым), каталог отдаёт её
 *  первой по order. Каталога в кэше нет — стадия родителя (допустимо:
 *  сервер вернёт точную, onSuccess заменит темп). */
export function initialStageOf(stages: readonly TaskStage[] | undefined): TaskStage | undefined {
  const sorted = [...(stages ?? [])].sort((a, b) => a.order - b.order);
  return sorted.find((s) => s.systemState === 'backlog') ?? sorted[0];
}

/** Темп подзадачи (I4): ЯВНЫЕ поля того, что вернёт сервер (`POST
 *  /tasks/:id/subtasks` = create с parentId: постановщик и ответственный
 *  по умолчанию — актор, приоритет normal, без срока/проекта/соисполнителей,
 *  начальная стадия). Копировать родителя нельзя: номер, срок, участники и
 *  стадия родителя выдавали бы темп за чужую задачу (а срок родителя попадал
 *  в каскад сдвига сроков подзадач). */
export function buildTempSubtask(
  parent: TaskDetail,
  title: string,
  stages: readonly TaskStage[] | undefined,
  me: AuthUser | null,
): TaskListItem {
  const actor = me ? { id: me.id, displayName: me.displayName, avatarUrl: null } : null;
  return {
    id: `${TEMP_PREFIX}${crypto.randomUUID()}`,
    number: TEMP_NUMBER,
    title,
    type: parent.type,
    stage: initialStageOf(stages) ?? parent.stage,
    personalStageId: null,
    customFields: {},
    priority: 'normal',
    deadline: null,
    creator: actor ?? parent.creator,
    assignee: actor,
    participants: [],
    project: null,
    parentId: parent.id,
    nodeId: null,
    spentMinutes: 0,
    commentsCount: 0,
    checklistDone: 0,
    checklistTotal: 0,
    source: 'manual',
    updatedAt: new Date().toISOString(),
  };
}
