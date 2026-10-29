/**
 * Права системной роли «Администратор». Дублирует каталог `Permission`
 * контрактов намеренно: seed исполняется до сборки contracts
 * (`prisma db seed` в свежем клоне), поэтому импорт из `@nodus/contracts`
 * здесь не годится. Рассинхрон ловит `src/rbac-permissions.test.ts`.
 *
 * `ADMIN_EXCLUDED_PERMISSIONS` — права каталога, которые «Администратор»
 * НЕ получает по умолчанию (#52, вердикт 29.10): секретные проекты админы
 * не видят — надзор идёт через отдельную роль «Системный надзор»
 * (`project.view_secret`, выдаётся точечно в матрице «Права доступа»).
 */
export const ALL_PERMISSIONS = [
  'core.admin',
  'task.create',
  'task.assign',
  'task.view_all',
  'task.manage_any',
  'task.override_gate',
  'workflow.manage',
  'directory.read',
  'directory.manage',
  'user.manage',
  'role.manage',
  'dictionary.manage',
  // #55: права корреспонденции v3; админу — миграцией 20261031120000_correspondence_permissions.
  'correspondence.register',
  'correspondence.resolve',
  'sticker.manage',
  'chat.moderate',
  'settings.uiDefaults',
  'crm.create',
  'crm.manage',
  // #431: управление атрибутами; роли admin выдаётся миграцией 20261028120000_custom_fields.
  'custom_field.manage',
  // #52: ядро проектов; админу — миграцией 20261105000000_projects_core
  // (кроме view_secret — надзор отдельной ролью).
  'project.create',
  'project.manage',
  'project.setup.manage',
  'project.channel.post',
  'project.view_secret',
] as const;

/** Не входит в дефолт «Администратора» (системный надзор — отдельная роль). */
export const ADMIN_EXCLUDED_PERMISSIONS = ['project.view_secret'] as const;

/** Что сид выдаёт роли admin: каталог минус исключения надзора. */
export const GRANTED_ADMIN_PERMISSIONS: readonly string[] = ALL_PERMISSIONS.filter(
  (permission) => !(ADMIN_EXCLUDED_PERMISSIONS as readonly string[]).includes(permission),
);
