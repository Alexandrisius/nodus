-- #380: вид сообщения (text | task_transition; #313 добавит system) и данные блока.
-- Константный DEFAULT не переписывает таблицу (PostgreSQL 11+).
ALTER TABLE "messages" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'text',
                       ADD COLUMN "payload" JSONB;
