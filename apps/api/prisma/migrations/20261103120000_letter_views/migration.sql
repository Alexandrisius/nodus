-- Личный признак «просмотрено» (редизайн #56): строка на сотрудника и
-- письмо, вставка идемпотентна (PK письмо+сотрудник, ON CONFLICT DO NOTHING
-- в репозитории). Гашение индикатора «я ещё не открывал» — POST /letters/:id/view.

CREATE TABLE "letter_views" (
    "letter_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "viewed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "letter_views_pkey" PRIMARY KEY ("letter_id", "user_id")
);

CREATE INDEX "letter_views_user_id_idx" ON "letter_views"("user_id");

ALTER TABLE "letter_views"
    ADD CONSTRAINT "letter_views_letter_id_fkey"
    FOREIGN KEY ("letter_id") REFERENCES "letters"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "letter_views"
    ADD CONSTRAINT "letter_views_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
