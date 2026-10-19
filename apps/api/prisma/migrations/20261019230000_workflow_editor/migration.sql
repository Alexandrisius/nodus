-- Редактор маршрутов (#378, ADR-0021): только expand — новые поля типов,
-- маршрутов (версия публикации, «засев один раз»), стадий (итог) и
-- переходов (показ, архивация вместо удаления).

-- AlterTable
ALTER TABLE "task_types" ADD COLUMN     "catalog_revision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "color" TEXT NOT NULL DEFAULT 'neutral',
ADD COLUMN     "creatable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "customized_at" TIMESTAMPTZ,
ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "icon" TEXT NOT NULL DEFAULT 'square-check';

-- AlterTable
ALTER TABLE "workflows" ADD COLUMN     "catalog_revision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "customized_at" TIMESTAMPTZ,
ADD COLUMN     "published_at" TIMESTAMPTZ,
ADD COLUMN     "published_by_id" UUID,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "workflow_stages" ADD COLUMN     "outcome" TEXT;

-- AlterTable
ALTER TABLE "workflow_transitions" ADD COLUMN     "archived_at" TIMESTAMPTZ,
ADD COLUMN     "display" TEXT NOT NULL DEFAULT 'button';

-- Бэкфилл итогов закрытых стадий ревизии 1: код cancelled → «отменена»,
-- остальные закрытые → «выполнена» (каталог ревизии 1: done, cancelled).
UPDATE "workflow_stages" SET "outcome" = 'cancelled'
WHERE "system_state" = 'closed' AND "code" = 'cancelled';
UPDATE "workflow_stages" SET "outcome" = 'success'
WHERE "system_state" = 'closed' AND "outcome" IS NULL;

-- Итог живёт только у закрытого этапа и обязателен у закрытого (#378).
ALTER TABLE "workflow_stages" ADD CONSTRAINT "workflow_stages_outcome_closed_check" CHECK (
  ("system_state" = 'closed') = ("outcome" IS NOT NULL)
);
