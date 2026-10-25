-- Право «Процессов» (#428, ADR-0024): `task.workflow_manage` → `workflow.manage`.
-- Роли, которым было выдано старое право, получают новое; старое снимается.
-- Досев администратору — отдельно (как #398): на проде seed не запускается.

INSERT INTO "role_permissions" ("role_id", "permission")
SELECT rp."role_id", 'workflow.manage'
FROM "role_permissions" rp
WHERE rp."permission" = 'task.workflow_manage'
ON CONFLICT ("role_id", "permission") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission")
SELECT r."id", 'workflow.manage'
FROM "roles" r
WHERE r."code" = 'admin'
ON CONFLICT ("role_id", "permission") DO NOTHING;

DELETE FROM "role_permissions" WHERE "permission" = 'task.workflow_manage';
