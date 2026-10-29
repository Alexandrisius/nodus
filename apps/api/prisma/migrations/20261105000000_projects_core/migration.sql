-- Модуль «Проекты» — ядро (#52, ADR-0030): проекты-договоры и «темы», типы,
-- портфели, двухрежимное участие, настройки портала. Expand-only: только
-- новые объекты, существующее не трогается. Значения-константы (visibility,
-- status, source) — TEXT + CHECK (I15: бизнес-списки — данные; системные
-- константы — zod-контракты, канон prisma-migrations).

-- CreateTable
CREATE TABLE "project_types" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "project_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_groups" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "creator_id" UUID NOT NULL,
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "project_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT 'blue',
    "type_id" UUID NOT NULL,
    "portfolio_id" UUID,
    "client_id" UUID,
    "manager_id" UUID NOT NULL,
    "assistant_ids" JSONB NOT NULL DEFAULT '[]',
    "visibility" TEXT NOT NULL DEFAULT 'open',
    "status" TEXT NOT NULL DEFAULT 'active',
    "completed_at" TIMESTAMPTZ,
    "archived_at" TIMESTAMPTZ,
    "started_at" DATE,
    "ends_at" DATE,
    "custom_fields" JSONB NOT NULL DEFAULT '{}',
    "creator_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_participants" (
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "observer_kind" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "project_participants_pkey" PRIMARY KEY ("project_id","user_id","source")
);

-- CreateTable
CREATE TABLE "portal_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "portal_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_types_name_key" ON "project_types"("name");

-- CreateIndex
CREATE INDEX "project_groups_name_id_idx" ON "project_groups"("name", "id");

-- CreateIndex
CREATE INDEX "projects_status_updated_at_id_idx" ON "projects"("status", "updated_at" DESC, "id");

-- CreateIndex
CREATE INDEX "projects_visibility_id_idx" ON "projects"("visibility", "id");

-- CreateIndex
CREATE INDEX "projects_type_id_idx" ON "projects"("type_id");

-- CreateIndex
CREATE INDEX "projects_portfolio_id_idx" ON "projects"("portfolio_id");

-- CreateIndex
CREATE INDEX "projects_client_id_idx" ON "projects"("client_id");

-- CreateIndex
CREATE INDEX "projects_manager_id_idx" ON "projects"("manager_id");

-- CreateIndex
CREATE INDEX "projects_assistants_gin" ON "projects" USING GIN ("assistant_ids" jsonb_path_ops);

-- CreateIndex
CREATE INDEX "projects_custom_fields_gin" ON "projects" USING GIN ("custom_fields" jsonb_path_ops);

-- CreateIndex
CREATE INDEX "project_participants_user_id_idx" ON "project_participants"("user_id");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "project_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "project_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_participants" ADD CONSTRAINT "project_participants_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Шифр договора уникален среди указанных, включая архивные проекты (шифр не
-- освобождается архивацией — Trimble Vista «number previously used cannot be
-- reused»; частичный индекс — Prisma его не декларирует).
CREATE UNIQUE INDEX "projects_code_key" ON "projects"("code") WHERE "code" IS NOT NULL;

-- Домены системных констант (I15: не ENUM — значения в zod-контрактах).
ALTER TABLE "projects"
  ADD CONSTRAINT "projects_visibility_check" CHECK ("visibility" IN ('open', 'secret')),
  ADD CONSTRAINT "projects_status_check" CHECK ("status" IN ('active', 'completed', 'archived')),
  ADD CONSTRAINT "projects_status_completed_at_check"
    CHECK (("status" = 'completed') = ("completed_at" IS NOT NULL)),
  ADD CONSTRAINT "projects_status_archived_at_check"
    CHECK (("status" = 'archived') = ("archived_at" IS NOT NULL)),
  ADD CONSTRAINT "projects_assistants_check"
    CHECK (jsonb_typeof("assistant_ids") = 'array' AND jsonb_array_length("assistant_ids") <= 10);

ALTER TABLE "project_participants"
  ADD CONSTRAINT "project_participants_source_check"
    CHECK ("source" IN ('manager', 'assistant', 'task', 'member', 'observer')),
  ADD CONSTRAINT "project_participants_observer_kind_check"
    CHECK ((("source" = 'observer') AND ("observer_kind" IN ('invited', 'creator', 'joined')))
        OR (("source" <> 'observer') AND ("observer_kind" IS NULL)));

-- Модуль готов к пилоту: флаг включается миграцией (#311) — seed на проде
-- не запускается; ON CONFLICT DO NOTHING не перетирает явное «выкл».
INSERT INTO "feature_flags" ("key", "enabled", "scope", "created_at", "updated_at")
VALUES ('projects', true, 'global', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- Роль системного надзора (вердикт 29.10, модель Битрикс-суперадмина):
-- секретные проекты вне участия видит только она; состав роли (учётка
-- Системного Администратора) назначается сидом/матрицей — в миграции роль
-- пустая, право закреплено.
INSERT INTO "roles" ("id", "code", "name", "description", "is_system", "created_at", "updated_at")
VALUES ('33333333-3333-4333-8333-333333333333', 'system_supervision', 'Системный надзор',
        'Видит секретные проекты вне участия (служебная учётка)', true,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- Права (#398: прод-доставление миграцией). project.create — всем ролям
-- (создаёт любой сотрудник, вердикт 23.10); project.manage и
-- project.setup.manage — администратору; project.view_secret — только роли
-- системного надзора (админы секретных НЕ видят — осознанное отклонение от
-- Jira/Linear, ADR-0030). project.channel.post намеренно НЕ выдаётся никому
-- (Slack announcement-паттерн: пишут руководство проекта + точечная выдача).
INSERT INTO "role_permissions" ("role_id", "permission")
SELECT r."id", 'project.create' FROM "roles" r
ON CONFLICT ("role_id", "permission") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission")
SELECT r."id", p."permission" FROM "roles" r
CROSS JOIN (VALUES ('project.manage'), ('project.setup.manage')) AS p("permission")
WHERE r."code" = 'admin'
ON CONFLICT ("role_id", "permission") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission")
SELECT r."id", 'project.view_secret' FROM "roles" r
WHERE r."code" = 'system_supervision'
ON CONFLICT ("role_id", "permission") DO NOTHING;

-- Типы проектов (допущение техплана #52: тип обязателен; сид «Договор» +
-- «Тема»; фиксированные id — идемпотентность).
INSERT INTO "project_types" ("id", "name", "created_at", "updated_at")
VALUES ('11111111-1111-4111-8111-111111111111', 'Договор', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
       ('22222222-2222-4222-8222-222222222222', 'Тема', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Дефолт видимости новых проектов (Р7): окно создания читает настройку;
-- код дефолтит 'open' и без строки.
INSERT INTO "portal_settings" ("key", "value", "updated_at")
VALUES ('projects.defaultVisibility', '"open"', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
