/**
 * Права доступа (RBAC, I8). Точечная нотация `module.action`
 * (канон — `docs/architecture/patterns.md`). Строковые литералы прав
 * в коде запрещены — только через этот каталог. Каталог только расширяется.
 */
export const Permission = {
  /** Полный административный доступ к ядру (справочники, флаги, аудит). */
  CORE_ADMIN: 'core.admin',
  /** Создание задачи/поручения. */
  TASK_CREATE: 'task.create',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];
