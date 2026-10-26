-- Права корреспонденции v3 (#55, Р13/O6, ADR-0027): `correspondence.register`
-- (канцелярия — вкладка «Новые», регистрация, ручное создание, закрытие без
-- регистрации, удаление спама, правка регистрационных данных) и
-- `correspondence.resolve` (принимает решения — первым в списке адресатов).
-- Права модели v2 `correspondence.create/archive` удалены из каталога: у них
-- нет потребителей, а тексты дублировали «Регистрировать письма».
-- Досев администратору — миграцией (как #398: на проде seed не запускается);
-- роль «Канцелярия» и её права — миграция модуля писем (#55, B1).

INSERT INTO "role_permissions" ("role_id", "permission")
SELECT r."id", p."permission"
FROM "roles" r
CROSS JOIN (VALUES
  ('correspondence.register'),
  ('correspondence.resolve')
) AS p("permission")
WHERE r."code" = 'admin'
ON CONFLICT ("role_id", "permission") DO NOTHING;

DELETE FROM "role_permissions"
WHERE "permission" IN ('correspondence.create', 'correspondence.archive');
