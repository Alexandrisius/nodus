-- Этап «Утверждение» — не завершение (#378, ADR-0020 дополнение 2): только
-- данные, схема не меняется.
-- 1) completed_at — момент входа в «Итог» (closed). Задачи, стоящие на
--    утверждении (done), его больше не несут: прежний движок ставил его
--    входом в done. Дальше поле ведёт StageMover (вход в итог / выход).
UPDATE "tasks"
SET "completed_at" = NULL
WHERE "system_state" = 'done' AND "completed_at" IS NOT NULL;

-- 2) Колонка этапа «Утверждение» в «Моём плане», которую сотрудник не
--    переименовывал, называется как в шаблоне каталога ревизии 3.
UPDATE "workflow_stages"
SET "name" = 'На утверждении', "updated_at" = now()
WHERE "name" = 'На контроле'
  AND "system_state" = 'done'
  AND "workflow_id" IN (SELECT "id" FROM "workflows" WHERE "kind" = 'personal');
