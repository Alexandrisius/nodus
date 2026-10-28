-- #56 «Приём почты общего ящика» (ADR-0035): подсистема mail-reception.
-- Expand-only: новые таблицы/колонки, ничего не дропается и не переименовывается.

-- Рубильник подсистемы (НЕ флаг модуля correspondence): приём и SMTP-отправка
-- — отдельная зона риска с внешним соединением и секретами; default false,
-- включение на проде — осознанный шаг администратора (runbook выпуска).
INSERT INTO "feature_flags" ("key", "enabled", "scope", "created_at", "updated_at")
VALUES ('mail-reception', false, 'global', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- Ящик-источник: курсор UIDVALIDITY/UID и аккумуляторы цикла приёма (Р4).
-- Сид 'chancery' — один общий ящик канцелярии до #477.
CREATE TABLE "mail_sources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "uid_validity" BIGINT,
    "last_uid" BIGINT,
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "last_notified_at" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "last_sync_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_sources_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mail_sources_code_key" ON "mail_sources"("code");

INSERT INTO "mail_sources" ("code", "created_at", "updated_at")
VALUES ('chancery', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- Конверт почтового письма (Р3): Message-ID — дедуп доставки и ключ цепочки
-- «ответ на»; флаги приёма — анти-яд и лимиты; надгробие спама (Р13) хранит
-- Message-ID после удаления, чтобы переимпорт не вернул мусор в «Новые».
ALTER TABLE "letters" ADD COLUMN "mail_message_id" TEXT;
ALTER TABLE "letters" ADD COLUMN "mail_in_reply_to" TEXT;
ALTER TABLE "letters" ADD COLUMN "mail_references" JSONB;
ALTER TABLE "letters" ADD COLUMN "mail_from_address" TEXT;
ALTER TABLE "letters" ADD COLUMN "mail_from_name" TEXT;
ALTER TABLE "letters" ADD COLUMN "mail_parse_issue" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "letters" ADD COLUMN "mail_storage_incomplete" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "letters" ADD COLUMN "deleted_at" TIMESTAMPTZ(3);

-- Страховка гонки дедупа (SELECT до записи — первая линия): конфликт unique
-- в tx → компенсация файлов по паттерну #55.
CREATE UNIQUE INDEX "letters_mail_message_id_key" ON "letters"("mail_message_id")
    WHERE "mail_message_id" IS NOT NULL;

-- Вложения почты (Р3/Р11): inline-картинки HTML-тела и их Content-ID.
ALTER TABLE "letter_attachments" ADD COLUMN "content_id" TEXT;
ALTER TABLE "letter_attachments" ADD COLUMN "inline" BOOLEAN NOT NULL DEFAULT false;

-- Связи писем (Р5; ёлочка и ручное управление — #461): сейчас единственный
-- вид — «ответ на»; авто (почтовая цепочка) или подтверждение галочкой.
CREATE TABLE "letter_relations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "letter_id" UUID NOT NULL,
    "related_letter_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "letter_relations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "letter_relations_letter_id_fkey" FOREIGN KEY ("letter_id")
        REFERENCES "letters"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "letter_relations_related_letter_id_fkey" FOREIGN KEY ("related_letter_id")
        REFERENCES "letters"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "letter_relations_kind_check" CHECK ("kind" IN ('reply_to')),
    CONSTRAINT "letter_relations_source_check" CHECK ("source" IN ('auto', 'manual'))
);

CREATE INDEX "letter_relations_letter_id_idx" ON "letter_relations"("letter_id");
CREATE INDEX "letter_relations_related_letter_id_idx" ON "letter_relations"("related_letter_id");
-- Идемпотентный автолинк: у письма не больше одного «ответ на» (#461 снимет).
CREATE UNIQUE INDEX "letter_relations_reply_to_unique" ON "letter_relations"("letter_id")
    WHERE "kind" = 'reply_to';

-- Подстановка контрагента по адресу отправителя (Р6, В2): точечный поиск.
CREATE INDEX "contact_persons_email_idx" ON "contact_persons"("email");
