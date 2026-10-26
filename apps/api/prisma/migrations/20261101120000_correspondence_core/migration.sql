-- Модуль корреспонденции (#55, ADR-0027): письма на движке «Процессы».
-- Expand-only: новые таблицы и аддитивные колонки; существующие данные не
-- трогаются. Регистрационный номер выдаёт движок (`assign_number`) в
-- транзакции перехода, поэтому серии номеров живут в модуле процессов.

-- ===== Серии номеров («Процессы», O1) =====

CREATE TABLE "number_series" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "reset" TEXT NOT NULL DEFAULT 'year',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "number_series_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "number_series_code_key" ON "number_series"("code");

-- Сброс только «по году»: других правил в #55 нет, а молчаливое значение
-- из будущего сломало бы расчёт года.
ALTER TABLE "number_series"
    ADD CONSTRAINT "number_series_reset_check"
    CHECK ("reset" IN ('year'));

CREATE TABLE "number_counters" (
    "series_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "number_counters_pkey" PRIMARY KEY ("series_id", "year")
);

ALTER TABLE "number_counters"
    ADD CONSTRAINT "number_counters_series_id_fkey"
    FOREIGN KEY ("series_id") REFERENCES "number_series"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ===== Письма =====

CREATE TABLE "letters" (
    "id" UUID NOT NULL,
    "type_id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "system_state" TEXT NOT NULL,
    "state_changed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "direction" TEXT NOT NULL,
    "reg_number" TEXT,
    "reg_series_id" UUID,
    "reg_year" INTEGER,
    "reg_seq" INTEGER,
    "reg_date" DATE,
    "registered_at" TIMESTAMPTZ,
    "registrar_id" UUID,
    "subject" TEXT,
    "their_number" TEXT,
    "their_date" DATE,
    "counterparty_id" UUID,
    "signer_id" UUID,
    "receipt_method_id" UUID,
    "project_id" UUID,
    "addressee_id" UUID,
    "response_deadline" DATE,
    "custom_fields" JSONB NOT NULL DEFAULT '{}',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "created_by" UUID NOT NULL,
    "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "letters_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "letters"
    ADD CONSTRAINT "letters_direction_check"
    CHECK ("direction" IN ('incoming', 'outgoing'));

ALTER TABLE "letters"
    ADD CONSTRAINT "letters_source_check"
    CHECK ("source" IN ('manual', 'mail'));

-- Номер и его состав неразделимы: либо все поля reg_*, либо ни одного.
-- Иначе письмо с «половиной» номера сломает печать и реестр.
ALTER TABLE "letters"
    ADD CONSTRAINT "letters_registration_complete_check"
    CHECK (
        ("reg_number" IS NULL) = ("reg_series_id" IS NULL)
        AND ("reg_number" IS NULL) = ("reg_year" IS NULL)
        AND ("reg_number" IS NULL) = ("reg_seq" IS NULL)
        AND ("reg_number" IS NULL) = ("reg_date" IS NULL)
        AND ("reg_number" IS NULL) = ("registered_at" IS NULL)
        AND ("reg_number" IS NULL) = ("registrar_id" IS NULL)
    );

-- Номер уникален в серии и году; NULL-ы в PostgreSQL различны, поэтому
-- незарегистрированные письма ограничение не задевают.
CREATE UNIQUE INDEX "letters_reg_series_id_reg_year_reg_seq_key"
    ON "letters"("reg_series_id", "reg_year", "reg_seq");

-- Очередь «Новые»: (received_at, id) DESC.
CREATE INDEX "letters_received_at_id_idx"
    ON "letters"("received_at" DESC, "id");

-- Реестр зарегистрированных и карточка корреспондента: (registered_at, id) DESC.
CREATE INDEX "letters_registered_at_id_idx"
    ON "letters"("registered_at" DESC, "id");

CREATE INDEX "letters_counterparty_id_registered_at_id_idx"
    ON "letters"("counterparty_id", "registered_at" DESC, "id");

CREATE INDEX "letters_addressee_id_system_state_idx"
    ON "letters"("addressee_id", "system_state");

CREATE INDEX "letters_stage_id_idx" ON "letters"("stage_id");
CREATE INDEX "letters_type_id_idx" ON "letters"("type_id");

CREATE INDEX "letters_custom_fields_gin"
    ON "letters" USING GIN ("custom_fields" jsonb_path_ops);

CREATE TABLE "letter_attachments" (
    "id" UUID NOT NULL,
    "letter_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "letter_attachments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "letter_attachments"
    ADD CONSTRAINT "letter_attachments_role_check"
    CHECK ("role" IN ('main', 'body', 'attachment', 'source'));

CREATE INDEX "letter_attachments_letter_id_sort_order_idx"
    ON "letter_attachments"("letter_id", "sort_order");

CREATE INDEX "letter_attachments_file_id_idx"
    ON "letter_attachments"("file_id");

-- Один основной документ и одно тело на письмо (частичный unique: у
-- приложений роль повторяется свободно).
CREATE UNIQUE INDEX "letter_attachments_letter_id_main_key"
    ON "letter_attachments"("letter_id") WHERE "role" = 'main';

CREATE UNIQUE INDEX "letter_attachments_letter_id_body_key"
    ON "letter_attachments"("letter_id") WHERE "role" = 'body';

ALTER TABLE "letter_attachments"
    ADD CONSTRAINT "letter_attachments_letter_id_fkey"
    FOREIGN KEY ("letter_id") REFERENCES "letters"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "letter_participants" (
    "letter_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'participant',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "letter_participants_pkey" PRIMARY KEY ("letter_id", "user_id")
);

CREATE INDEX "letter_participants_user_id_idx" ON "letter_participants"("user_id");

ALTER TABLE "letter_participants"
    ADD CONSTRAINT "letter_participants_letter_id_fkey"
    FOREIGN KEY ("letter_id") REFERENCES "letters"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ===== Чат письма: одна беседа на письмо =====

CREATE UNIQUE INDEX "conversations_letter_id_key"
    ON "conversations"("letter_id") WHERE "type" = 'letter';

-- ===== CRM: подписант в использовании контрагента =====

ALTER TABLE "counterparty_usages" ADD COLUMN "contact_id" UUID;

CREATE INDEX "counterparty_usages_contact_id_idx"
    ON "counterparty_usages"("contact_id");

-- ===== Модуль, флаг, роль и права =====

-- Флаг модуля: миграцией (на проде seed не запускается — #311);
-- ON CONFLICT DO NOTHING не перетирает явное «выкл» администратора.
INSERT INTO "feature_flags" ("key", "enabled", "scope", "created_at", "updated_at")
VALUES ('correspondence', true, 'global', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- Системная роль «Канцелярия» (Р13, ADR-0033 доп. п.3): регистрация писем и
-- ведение справочника контрагентов. Назначается составом роли (#379);
-- is_system — код не переименовывается и роль не удаляется.
INSERT INTO "roles" ("id", "code", "name", "description", "is_system", "created_at", "updated_at")
VALUES (
    gen_random_uuid(),
    'office',
    'Канцелярия',
    'Регистрация входящих писем, ведение контрагентов',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission")
SELECT r."id", p."permission"
FROM "roles" r
CROSS JOIN (VALUES ('correspondence.register'), ('crm.create'), ('crm.manage')) AS p("permission")
WHERE r."code" = 'office'
ON CONFLICT ("role_id", "permission") DO NOTHING;

-- «Принимать решения по письмам» — администратору (как в U1) и канцелярии
-- не выдаётся: решения принимает руководство через матрицу.
INSERT INTO "role_permissions" ("role_id", "permission")
SELECT r."id", 'correspondence.resolve'
FROM "roles" r
WHERE r."code" = 'admin'
ON CONFLICT ("role_id", "permission") DO NOTHING;

-- ===== Справочник «Способы поступления» (Р14) =====

INSERT INTO "dictionaries" ("id", "code", "name", "hierarchical", "is_system", "created_at", "updated_at")
VALUES (gen_random_uuid(), 'receipt-method', 'Способы поступления', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "dictionary_items" ("id", "dictionary_id", "code", "name", "sort_order", "created_at", "updated_at")
SELECT gen_random_uuid(), d."id", v."code", v."name", v."sort_order", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "dictionaries" d
CROSS JOIN (VALUES
    ('email', 'Электронная почта', 0),
    ('post', 'Почта', 1),
    ('courier', 'Нарочным', 2),
    ('smdo', 'СМДО', 3)
) AS v("code", "name", "sort_order")
WHERE d."code" = 'receipt-method'
ON CONFLICT ("dictionary_id", "code") DO NOTHING;
