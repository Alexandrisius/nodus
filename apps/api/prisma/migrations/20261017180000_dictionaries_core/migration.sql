-- CreateTable
CREATE TABLE "dictionaries" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hierarchical" BOOLEAN NOT NULL DEFAULT false,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "dictionaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dictionary_items" (
    "id" UUID NOT NULL,
    "dictionary_id" UUID NOT NULL,
    "parent_id" UUID,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "dictionary_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dictionaries_code_key" ON "dictionaries"("code");

-- CreateIndex
CREATE INDEX "dictionary_items_dictionary_id_sort_order_name_id_idx" ON "dictionary_items"("dictionary_id", "sort_order", "name", "id");

-- CreateIndex
CREATE INDEX "dictionary_items_parent_id_idx" ON "dictionary_items"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_items_dictionary_id_code_key" ON "dictionary_items"("dictionary_id", "code");

-- AddForeignKey
ALTER TABLE "dictionary_items" ADD CONSTRAINT "dictionary_items_dictionary_id_fkey" FOREIGN KEY ("dictionary_id") REFERENCES "dictionaries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dictionary_items" ADD CONSTRAINT "dictionary_items_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "dictionary_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Сид системного справочника «Вид документа» (#54): данные нужны на любой
-- установке (prisma/seed на проде не запускается — gotcha #311), поэтому
-- миграцией. ON CONFLICT DO NOTHING: правки администратора не перетираются.
-- «Письмо» — первым: дефолт регистрации корреспонденции.
INSERT INTO "dictionaries" ("id", "code", "name", "hierarchical", "is_system", "created_at", "updated_at")
VALUES (gen_random_uuid(), 'document-kind', 'Вид документа', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "dictionary_items" ("id", "dictionary_id", "code", "name", "sort_order", "created_at", "updated_at")
SELECT gen_random_uuid(), d."id", v.code, v.name, v.sort_order, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "dictionaries" d
CROSS JOIN (VALUES
    ('letter', 'Письмо', 10),
    ('contract', 'Договор', 20),
    ('order', 'Приказ', 30),
    ('request', 'Запрос', 40),
    ('act', 'Акт', 50)
) AS v(code, name, sort_order)
WHERE d."code" = 'document-kind'
ON CONFLICT ("dictionary_id", "code") DO NOTHING;
