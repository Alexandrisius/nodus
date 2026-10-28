-- «Основной документ письма» (#56): роль body_pdf — PDF-копия тела,
-- системный кандидат основного документа (конвертация Gotenberg, фоново).
-- Флаг отказа конвертера — письмо живёт, кандидат недоступен.

ALTER TABLE "letters"
    ADD COLUMN "mail_body_pdf_issue" BOOLEAN NOT NULL DEFAULT false;

-- Роль тела-PDF в замкнутом словаре (CHECK пересоздаётся: ADD CONSTRAINT
-- не расширяет список).
ALTER TABLE "letter_attachments" DROP CONSTRAINT "letter_attachments_role_check";
ALTER TABLE "letter_attachments"
    ADD CONSTRAINT "letter_attachments_role_check"
    CHECK ("role" IN ('main', 'body', 'body_pdf', 'attachment', 'source'));

-- Одна PDF-копия тела на письмо (частичный unique, как main и body).
CREATE UNIQUE INDEX "letter_attachments_letter_id_body_pdf_key"
    ON "letter_attachments"("letter_id") WHERE "role" = 'body_pdf';
