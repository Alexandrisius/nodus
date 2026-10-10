-- AlterTable (#239: накопительное множество упомянутых — дифф-уведомления правок)
ALTER TABLE "messages" ADD COLUMN     "ever_mentioned_user_ids" JSONB;

-- Backfill: ever = текущий снапшот (кого убрали до миграции — потеряно,
-- консервативно: меньше повторных пингов; новые строки пишет код).
UPDATE "messages" SET "ever_mentioned_user_ids" = COALESCE("mentioned_user_ids", '[]'::jsonb)
WHERE "ever_mentioned_user_ids" IS NULL;
