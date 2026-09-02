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
  /** Назначение/смена ответственного задачи. */
  TASK_ASSIGN: 'task.assign',
  /** Чтение справочника сотрудников и оргструктуры. */
  DIRECTORY_READ: 'directory.read',
  /** Управление пользователями, отделами и должностями (directory). */
  DIRECTORY_MANAGE: 'directory.manage',
  /** Управление учётными записями (блокировка, сброс пароля) — admin. */
  USER_MANAGE: 'user.manage',
  /** Управление ролями и их правами. */
  ROLE_MANAGE: 'role.manage',
  /** Управление справочниками/классификаторами (dictionaries, I15). */
  DICTIONARY_MANAGE: 'dictionary.manage',
  /** Регистрация корреспонденции (входящие/исходящие). */
  CORRESPONDENCE_CREATE: 'correspondence.create',
  /** Архивация корреспонденции. */
  CORRESPONDENCE_ARCHIVE: 'correspondence.archive',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];
