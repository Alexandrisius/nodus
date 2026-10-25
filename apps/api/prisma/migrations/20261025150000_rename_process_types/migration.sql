-- «Процессы» (#428, ADR-0024): тип задачи → тип процесса. RENAME таблицы,
-- столбца и имён ограничений сохраняет данные и индексы; категория и
-- направление — expand-only (старый код их не читает, новый читает).

ALTER TABLE "task_types" RENAME TO "process_types";
ALTER TABLE "process_types" RENAME CONSTRAINT "task_types_pkey" TO "process_types_pkey";
ALTER INDEX "task_types_code_key" RENAME TO "process_types_code_key";

-- Категория сущности: существующие типы — задачи. Письма — с направлением.
ALTER TABLE "process_types" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'task',
ADD COLUMN "direction" TEXT;

ALTER TABLE "process_types" ADD CONSTRAINT "process_types_category_check"
  CHECK ("category" IN ('task', 'letter'));

-- Направление живёт только у письма (ADR-0024 п.2).
ALTER TABLE "process_types" ADD CONSTRAINT "process_types_direction_check"
  CHECK (
    ("category" = 'letter') = ("direction" IS NOT NULL)
    AND ("direction" IS NULL OR "direction" IN ('incoming', 'outgoing'))
  );

-- Схема «тип → маршрут»: столбец типа процесса и его FK/индекс.
ALTER TABLE "workflow_scheme_entries" RENAME COLUMN "task_type_id" TO "process_type_id";
ALTER TABLE "workflow_scheme_entries"
  RENAME CONSTRAINT "workflow_scheme_entries_task_type_id_fkey"
  TO "workflow_scheme_entries_process_type_id_fkey";
ALTER INDEX "workflow_scheme_entries_task_type_id_idx"
  RENAME TO "workflow_scheme_entries_process_type_id_idx";
