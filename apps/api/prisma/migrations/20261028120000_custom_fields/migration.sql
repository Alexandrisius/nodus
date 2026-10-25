-- Модуль custom-fields (#431, ADR-0029): реестр определений атрибутов.
-- Expand-only: только новые объекты; значения живут в JSONB сущностей
-- (tasks.custom_fields и т.д.) по id определения — отдельной таблицы нет.
-- Скрытие (`hidden`) заменяет архив (вердикт владельца 25.10.2026): имя
-- уникально среди ВСЕХ атрибутов области, лимит 100 считается по всем.

-- CreateTable
CREATE TABLE "field_definitions" (
    "id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hint" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "default_value" JSONB,
    "report_indexed" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "field_definitions_pkey" PRIMARY KEY ("id")
);

-- Домены областей и типов — на уровне БД: опечатка в коде или ручной правке
-- не создаёт атрибут, который не прочитает ни один потребитель.
ALTER TABLE "field_definitions"
    ADD CONSTRAINT "field_definitions_scope_check"
    CHECK ("scope" IN ('task', 'letter', 'project', 'counterparty'));

ALTER TABLE "field_definitions"
    ADD CONSTRAINT "field_definitions_type_check"
    CHECK ("type" IN (
        'text', 'long_text', 'number', 'money', 'date', 'datetime', 'duration',
        'bool', 'enum', 'multienum', 'user', 'users', 'department', 'project',
        'counterparty', 'link'
    ));

-- Выдача реестра области в порядке карточки/фильтров: (scope, sort_order, id).
CREATE INDEX "field_definitions_scope_sort_order_id_idx"
    ON "field_definitions"("scope", "sort_order", "id");

-- Уникальность имени в области без учёта регистра и внешних пробелов
-- («№ накладной» = « № накладной »). Prisma выражения в индексе не
-- декларирует — прецедент ADR-0033: индекс живёт только в миграции,
-- проверка сервиса дублирует его под advisory-lock области (гонка двух
-- администраторов даёт 409, а не P2002).
CREATE UNIQUE INDEX "field_definitions_scope_name_key"
    ON "field_definitions"("scope", lower(btrim("name")));

-- Системный справочник «Валюты» (Р10): тип «Деньги» без него мёртв.
-- Данные миграции, а не seed (на проде seed не запускается — gotcha #311);
-- ON CONFLICT DO NOTHING — правки администратора не перетираются.
-- BYN первым: валюта по умолчанию для белорусской компании.
INSERT INTO "dictionaries" ("id", "code", "name", "hierarchical", "is_system", "created_at", "updated_at")
VALUES (gen_random_uuid(), 'currency', 'Валюты', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "dictionary_items" ("id", "dictionary_id", "code", "name", "sort_order", "created_at", "updated_at")
SELECT gen_random_uuid(), d."id", v.code, v.name, v.sort_order, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "dictionaries" d
CROSS JOIN (VALUES
    ('BYN', 'Белорусский рубль', 10),
    ('RUB', 'Российский рубль', 20),
    ('USD', 'Доллар США', 30),
    ('EUR', 'Евро', 40),
    ('CNY', 'Китайский юань', 50)
) AS v(code, name, sort_order)
WHERE d."code" = 'currency'
ON CONFLICT ("dictionary_id", "code") DO NOTHING;

-- Право управления атрибутами (Р13): создание/правка/удаление определений.
-- Досев администратору миграцией — на проде seed не запускается (#398).
INSERT INTO "role_permissions" ("role_id", "permission")
SELECT r."id", 'custom_field.manage'
FROM "roles" r
WHERE r."code" = 'admin'
ON CONFLICT ("role_id", "permission") DO NOTHING;
