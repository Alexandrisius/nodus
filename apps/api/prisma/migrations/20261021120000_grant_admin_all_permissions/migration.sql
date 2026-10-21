-- Администратор — полный доступ к порталу (#398): seed на проде не
-- запускается, поэтому права, добавленные только в ALL_PERMISSIONS, до
-- существующей роли admin не доезжают (#311 — тот же класс для флагов).
-- Досев всех прав каталога Permission идемпотентен: повторный деплой и
-- параллельные установки не ломаются.
INSERT INTO "role_permissions" ("role_id", "permission")
SELECT r."id", p."permission"
FROM "roles" r
CROSS JOIN (VALUES
  ('core.admin'),
  ('task.create'),
  ('task.assign'),
  ('task.view_all'),
  ('task.manage_any'),
  ('task.override_gate'),
  ('task.workflow_manage'),
  ('directory.read'),
  ('directory.manage'),
  ('user.manage'),
  ('role.manage'),
  ('dictionary.manage'),
  ('sticker.manage'),
  ('chat.moderate'),
  ('correspondence.create'),
  ('correspondence.archive'),
  ('settings.uiDefaults')
) AS p("permission")
WHERE r."code" = 'admin'
ON CONFLICT ("role_id", "permission") DO NOTHING;
