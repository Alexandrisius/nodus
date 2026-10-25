-- Задачи → «Процессы»: ссылки на тип, маршрут и стадию становятся plain UUID
-- без FK (ADR-0024 п.3, I3): таблицы принадлежат модулю workflows. Индексы
-- остаются — фильтры и счётчики не меняются. Целостность держится тем, что
-- типы, маршруты и стадии архивируются, а не удаляются.

ALTER TABLE "tasks"
  DROP CONSTRAINT "tasks_type_id_fkey",
  DROP CONSTRAINT "tasks_workflow_id_fkey",
  DROP CONSTRAINT "tasks_stage_id_fkey";
