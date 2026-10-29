-- Дерево проекта (#467, ADR-0030 «Дополнение»): виды уровней (ярлыки узлов),
-- узлы-папки со свободной вложенностью, привязка задач (tasks.node_id) и
-- подсказка видов в типе проекта. Expand-only: новые таблицы/колонки,
-- существующее не трогается. Порядок узлов — fractional-index TEXT
-- COLLATE "C" (канон 20261016180000); задачи — plain UUID без FK (I3,
-- канон projectId).

-- CreateTable
CREATE TABLE "node_levels" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "node_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_nodes" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "parent_id" UUID,
    "level_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "order" TEXT COLLATE "C" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "project_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_nodes_project_id_parent_id_idx" ON "project_nodes"("project_id", "parent_id");

-- CreateIndex
CREATE INDEX "project_nodes_project_id_order_idx" ON "project_nodes"("project_id", "order");

-- AddForeignKey
ALTER TABLE "project_nodes" ADD CONSTRAINT "project_nodes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- Детей не снимаем каскадом: удаление только пустого узла (409 NOT_EMPTY),
-- поэтому Restrict страхует от обхода сервисного порядка удаления.
ALTER TABLE "project_nodes" ADD CONSTRAINT "project_nodes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "project_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_nodes" ADD CONSTRAINT "project_nodes_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "node_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Название вида уровня уникально без учёта регистра и краёв: выраженный
-- индекс lower(btrim(name)) — Prisma его не декларирует (паттерн
-- projects_code_key; значения-константы вида — TEXT, I15).
CREATE UNIQUE INDEX "node_levels_name_nocase_key" ON "node_levels" (lower(btrim("name")));

-- Шифр узла уникален в проекте среди указанных (частичный индекс —
-- паттерн projects_code_key).
CREATE UNIQUE INDEX "project_nodes_project_code_key" ON "project_nodes"("project_id", "code") WHERE "code" IS NOT NULL;

-- Задача — лист дерева: node_id без FK (модуль задач, I3), индекс среза.
ALTER TABLE "tasks" ADD COLUMN "node_id" UUID;
CREATE INDEX "tasks_node_id_idx" ON "tasks"("node_id");

-- Подсказка дефолтных видов узлов в типе проекта (#467, вердикт 30.10):
-- id строк node_levels; null — подсказки нет. Лимит ≤10 — контракт.
ALTER TABLE "project_types" ADD COLUMN "level_kind_ids" JSONB;

-- Посев видов уровней (фиксированные id — идемпотентность; ТКП 45-1.02-295
-- «Положение о составе разделов…»: стадия, очередь, пусковой комплекс,
-- здание по генплану, раздел, этап). Значки/цвета — ключи закрытых
-- реестров contracts (nodeLevelIconSchema, projectColorSchema).
INSERT INTO "node_levels" ("id", "name", "icon", "color", "created_at", "updated_at")
VALUES
    ('33333333-3333-4333-8333-333333333301', 'Стадия', 'layers', 'amber', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('33333333-3333-4333-8333-333333333302', 'Очередь', 'route', 'blue', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('33333333-3333-4333-8333-333333333303', 'Пусковой комплекс', 'milestone', 'green', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('33333333-3333-4333-8333-333333333304', 'Здание по генплану', 'building', 'sky', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('33333333-3333-4333-8333-333333333305', 'Раздел', 'listTree', 'pink', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('33333333-3333-4333-8333-333333333306', 'Этап', 'flag', 'terra', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
