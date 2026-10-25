-- Модуль CRM (#460, ADR-0033): контрагенты, контактные лица, проекция
-- счётчиков связей. Expand-only: только новые объекты, существующее не
-- трогается. pg_trgm (contrib, trusted с PG13) — первым оператором: без него
-- не создаются GIN-индексы gin_trgm_ops (подсказка похожих по названию).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateTable
CREATE TABLE "counterparties" (
    "id" UUID NOT NULL,
    "short_name" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "unp" TEXT,
    "address" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "custom_fields" JSONB NOT NULL DEFAULT '{}',
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "counterparties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_persons" (
    "id" UUID NOT NULL,
    "counterparty_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "position" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "contact_persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counterparty_usages" (
    "source_kind" TEXT NOT NULL,
    "source_id" UUID NOT NULL,
    "counterparty_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "counterparty_usages_pkey" PRIMARY KEY ("source_kind","source_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "counterparties_unp_key" ON "counterparties"("unp");

-- CreateIndex
CREATE INDEX "counterparties_short_name_id_idx" ON "counterparties"("short_name", "id");

-- CreateIndex
CREATE INDEX "counterparties_short_name_trgm" ON "counterparties" USING GIN ("short_name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "counterparties_full_name_trgm" ON "counterparties" USING GIN ("full_name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "counterparties_custom_fields_gin" ON "counterparties" USING GIN ("custom_fields" jsonb_path_ops);

-- CreateIndex
CREATE INDEX "contact_persons_counterparty_id_full_name_id_idx" ON "contact_persons"("counterparty_id", "full_name", "id");

-- CreateIndex
CREATE INDEX "counterparty_usages_counterparty_id_source_kind_idx" ON "counterparty_usages"("counterparty_id", "source_kind");

-- AddForeignKey
ALTER TABLE "contact_persons" ADD CONSTRAINT "contact_persons_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparty_usages" ADD CONSTRAINT "counterparty_usages_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Модуль готов к пилоту: флаг включается миграцией на любой установке
-- (#311) — seed на проде не запускается; ON CONFLICT DO NOTHING не перетирает
-- явное «выкл» администратора.
INSERT INTO "feature_flags" ("key", "enabled", "scope", "created_at", "updated_at")
VALUES ('crm', true, 'global', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- Права CRM доезжают до прод-админа миграцией (#398): сид на проде не гоняется.
-- «Канцелярия» получит их в #55, остальным — галочка в матрице #379.
INSERT INTO "role_permissions" ("role_id", "permission")
SELECT r."id", p."permission" FROM "roles" r
CROSS JOIN (VALUES ('crm.create'), ('crm.manage')) AS p("permission")
WHERE r."code" = 'admin'
ON CONFLICT ("role_id", "permission") DO NOTHING;
