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
  /** Видеть все задачи портала — вне участия и оргструктуры (#37). */
  TASK_VIEW_ALL: 'task.view_all',
  /** Управлять любой видимой задачей как постановщик: правка, участники,
   *  переходы, удаление (#37). */
  TASK_MANAGE_ANY: 'task.manage_any',
  /** Обход гейта DoR/DoD перехода с обязательной причиной (аудит, ADR-0020). */
  TASK_OVERRIDE_GATE: 'task.override_gate',
  /** Управление «Процессами» (ADR-0024): создание и свойства типов,
   *  публикация маршрутов, расстановка холста; до матрицы #379 — только
   *  роль администратора. */
  WORKFLOW_MANAGE: 'workflow.manage',
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
  /** Корпоративные стикер-паки: создание/пополнение/удаление «для всех»
   *  (chat, #143); личные паки права не требуют. */
  STICKER_MANAGE: 'sticker.manage',
  /** Модерация мессенджера (#245): удаление любых сообщений в группах и
   *  каналах; действует вместе с админами бесед (матрица owner/admin/member). */
  CHAT_MODERATE: 'chat.moderate',
  /** Регистрация корреспонденции (входящие/исходящие). */
  CORRESPONDENCE_CREATE: 'correspondence.create',
  /** Архивация корреспонденции. */
  CORRESPONDENCE_ARCHIVE: 'correspondence.archive',
  /** Общие настройки UI компании (порядок модулей/вкладок «Для всех») — admin. */
  SETTINGS_UI_DEFAULTS: 'settings.uiDefaults',
  /** Создать контрагента (в т.ч. «на лету» при регистрации письма) и
   *  добавить контактное лицо; чтение справочника открыто всем (ADR-0033). */
  CRM_CREATE: 'crm.create',
  /** Вести справочник: правка реквизитов, архивация/возврат контрагентов
   *  и контактных лиц (ADR-0033). */
  CRM_MANAGE: 'crm.manage',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];
