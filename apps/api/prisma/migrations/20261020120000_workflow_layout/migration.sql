-- Редактор маршрутов, редакция 2 (#378, ADR-0022): только expand.
-- 1) Раскладка холста общая для всех: позиции статусов, точки подключения
--    стрелок и положение подписей хранятся с маршрутом (раньше — только в
--    браузере того, кто двигал).
-- 2) CHECK значений итога статуса (спека: success | cancelled).

-- AlterTable
ALTER TABLE "workflows" ADD COLUMN     "layout" JSONB NOT NULL DEFAULT '{}';

-- CHECK: итог — только известные значения (NULL у незакрывающих этапов).
ALTER TABLE "workflow_stages" ADD CONSTRAINT "workflow_stages_outcome_values_check" CHECK (
  "outcome" IS NULL OR "outcome" IN ('success', 'cancelled')
);
