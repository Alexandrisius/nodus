/**
 * Полный набор прав системной роли «Администратор». Дублирует каталог
 * `Permission` контрактов намеренно: seed исполняется до сборки contracts
 * (`prisma db seed` в свежем клоне), поэтому импорт из `@nodus/contracts`
 * здесь не годится. Рассинхрон ловит `src/rbac-permissions.test.ts`.
 */
export const ALL_PERMISSIONS = [
  'core.admin',
  'task.create',
  'task.assign',
  'task.view_all',
  'task.manage_any',
  'task.override_gate',
  'task.workflow_manage',
  'directory.read',
  'directory.manage',
  'user.manage',
  'role.manage',
  'dictionary.manage',
  'correspondence.create',
  'correspondence.archive',
  'sticker.manage',
  'chat.moderate',
  'settings.uiDefaults',
] as const;
