-- CreateTable
CREATE TABLE "task_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "structural" BOOLEAN NOT NULL DEFAULT false,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "task_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflows" (
    "id" UUID NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "owner_id" UUID,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_template" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_stages" (
    "id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "system_state" TEXT NOT NULL,
    "is_initial" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "workflow_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_transitions" (
    "id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "from_stage_id" UUID,
    "to_stage_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "rules" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "workflow_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_schemes" (
    "id" UUID NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "workflow_schemes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_scheme_entries" (
    "scheme_id" UUID NOT NULL,
    "task_type_id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,

    CONSTRAINT "workflow_scheme_entries_pkey" PRIMARY KEY ("scheme_id","task_type_id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "type_id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "system_state" TEXT NOT NULL,
    "state_changed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stage_order" TEXT COLLATE "C" NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "deadline" TIMESTAMPTZ,
    "planned_minutes" INTEGER,
    "accept_required" BOOLEAN NOT NULL DEFAULT false,
    "creator_id" UUID NOT NULL,
    "assignee_id" UUID NOT NULL,
    "parent_id" UUID,
    "project_id" UUID,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "source_id" UUID,
    "origin" JSONB,
    "spent_minutes" INTEGER NOT NULL DEFAULT 0,
    "checklist_done" INTEGER NOT NULL DEFAULT 0,
    "checklist_total" INTEGER NOT NULL DEFAULT 0,
    "comments_count" INTEGER NOT NULL DEFAULT 0,
    "custom_fields" JSONB NOT NULL DEFAULT '{}',
    "confidential" BOOLEAN NOT NULL DEFAULT false,
    "external_ref" TEXT,
    "completed_at" TIMESTAMPTZ,
    "overdue_notified_at" TIMESTAMPTZ,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_participants" (
    "task_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_participants_pkey" PRIMARY KEY ("task_id","user_id")
);

-- CreateTable
CREATE TABLE "task_personal_placements" (
    "task_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "sort_order" TEXT COLLATE "C" NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "task_personal_placements_pkey" PRIMARY KEY ("task_id","user_id")
);

-- CreateTable
CREATE TABLE "task_checklist_items" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" TEXT COLLATE "C" NOT NULL,
    "done_by" UUID,
    "done_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "task_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_relations" (
    "id" UUID NOT NULL,
    "from_task_id" UUID NOT NULL,
    "to_task_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_entries" (
    "id" UUID NOT NULL,
    "task_id" UUID,
    "project_id" UUID,
    "user_id" UUID NOT NULL,
    "minutes" INTEGER NOT NULL DEFAULT 0,
    "date" DATE NOT NULL,
    "method" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ,
    "ended_at" TIMESTAMPTZ,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_results" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "message_ids" JSONB NOT NULL DEFAULT '[]',
    "author_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "task_types_code_key" ON "task_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "workflows_code_key" ON "workflows"("code");

-- CreateIndex
CREATE INDEX "workflows_kind_owner_id_idx" ON "workflows"("kind", "owner_id");

-- CreateIndex
CREATE INDEX "workflow_stages_workflow_id_sort_order_idx" ON "workflow_stages"("workflow_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_stages_workflow_id_code_key" ON "workflow_stages"("workflow_id", "code");

-- CreateIndex
CREATE INDEX "workflow_transitions_workflow_id_from_stage_id_idx" ON "workflow_transitions"("workflow_id", "from_stage_id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_transitions_workflow_id_code_key" ON "workflow_transitions"("workflow_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_schemes_code_key" ON "workflow_schemes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_number_key" ON "tasks"("number");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_external_ref_key" ON "tasks"("external_ref");

-- CreateIndex
CREATE INDEX "tasks_stage_id_stage_order_id_idx" ON "tasks"("stage_id", "stage_order", "id");

-- CreateIndex
CREATE INDEX "tasks_assignee_id_system_state_idx" ON "tasks"("assignee_id", "system_state");

-- CreateIndex
CREATE INDEX "tasks_creator_id_system_state_idx" ON "tasks"("creator_id", "system_state");

-- CreateIndex
CREATE INDEX "tasks_parent_id_idx" ON "tasks"("parent_id");

-- CreateIndex
CREATE INDEX "tasks_project_id_idx" ON "tasks"("project_id");

-- CreateIndex
CREATE INDEX "tasks_system_state_deadline_idx" ON "tasks"("system_state", "deadline");

-- CreateIndex
CREATE INDEX "tasks_updated_at_id_idx" ON "tasks"("updated_at" DESC, "id");

-- CreateIndex
CREATE INDEX "tasks_source_source_id_idx" ON "tasks"("source", "source_id");

-- CreateIndex
CREATE INDEX "task_participants_user_id_role_idx" ON "task_participants"("user_id", "role");

-- CreateIndex
CREATE INDEX "task_personal_placements_user_id_stage_id_sort_order_task_i_idx" ON "task_personal_placements"("user_id", "stage_id", "sort_order", "task_id");

-- CreateIndex
CREATE INDEX "task_checklist_items_task_id_sort_order_idx" ON "task_checklist_items"("task_id", "sort_order");

-- CreateIndex
CREATE INDEX "task_relations_to_task_id_idx" ON "task_relations"("to_task_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_relations_from_task_id_to_task_id_kind_key" ON "task_relations"("from_task_id", "to_task_id", "kind");

-- CreateIndex
CREATE INDEX "time_entries_task_id_created_at_id_idx" ON "time_entries"("task_id", "created_at" DESC, "id");

-- CreateIndex
CREATE INDEX "time_entries_user_id_date_idx" ON "time_entries"("user_id", "date");

-- CreateIndex
CREATE INDEX "task_results_task_id_created_at_idx" ON "task_results"("task_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "workflow_stages" ADD CONSTRAINT "workflow_stages_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_from_stage_id_fkey" FOREIGN KEY ("from_stage_id") REFERENCES "workflow_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_to_stage_id_fkey" FOREIGN KEY ("to_stage_id") REFERENCES "workflow_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_scheme_entries" ADD CONSTRAINT "workflow_scheme_entries_scheme_id_fkey" FOREIGN KEY ("scheme_id") REFERENCES "workflow_schemes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_scheme_entries" ADD CONSTRAINT "workflow_scheme_entries_task_type_id_fkey" FOREIGN KEY ("task_type_id") REFERENCES "task_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_scheme_entries" ADD CONSTRAINT "workflow_scheme_entries_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "task_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "workflow_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_participants" ADD CONSTRAINT "task_participants_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_personal_placements" ADD CONSTRAINT "task_personal_placements_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_personal_placements" ADD CONSTRAINT "task_personal_placements_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "workflow_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_checklist_items" ADD CONSTRAINT "task_checklist_items_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_relations" ADD CONSTRAINT "task_relations_from_task_id_fkey" FOREIGN KEY ("from_task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_relations" ADD CONSTRAINT "task_relations_to_task_id_fkey" FOREIGN KEY ("to_task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_results" ADD CONSTRAINT "task_results_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ручные части (Prisma не декларирует): коллация "C" ключей порядка выше
-- (fractional-index сравнивается побайтно), частичные уникальные индексы,
-- GIN кастомных полей.

-- Один личный маршрут «Мой план» на сотрудника (ADR-0008).
CREATE UNIQUE INDEX "workflows_personal_owner_key" ON "workflows"("owner_id") WHERE "kind" = 'personal' AND "owner_id" IS NOT NULL;

-- Одна системная схема по умолчанию.
CREATE UNIQUE INDEX "workflow_schemes_single_default_key" ON "workflow_schemes"("is_default") WHERE "is_default";

-- Один идущий таймер на сотрудника.
CREATE UNIQUE INDEX "time_entries_running_timer_key" ON "time_entries"("user_id") WHERE "method" = 'timer' AND "ended_at" IS NULL;

-- Дедуп происхождения: одна ЖИВАЯ задача на источник у постановщика
-- (удалённая освобождает источник; другой сотрудник ставит свою).
CREATE UNIQUE INDEX "tasks_source_dedup_key" ON "tasks"("source", "source_id", "creator_id") WHERE "source_id" IS NOT NULL AND "deleted_at" IS NULL;

-- Кастомные поля (data-model.md: JSONB + GIN с первой миграции).
CREATE INDEX "tasks_custom_fields_gin" ON "tasks" USING GIN ("custom_fields" jsonb_path_ops);

-- Горячий путь сканера просрочки: живые задачи с дедлайном, ещё не уведомлённые.
CREATE INDEX "tasks_overdue_scan_idx" ON "tasks"("deadline") WHERE "deleted_at" IS NULL AND "overdue_notified_at" IS NULL AND "system_state" NOT IN ('done', 'closed');
