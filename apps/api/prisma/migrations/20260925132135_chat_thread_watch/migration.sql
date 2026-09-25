-- DropIndex
-- INCLUDE-индекс (conversation_id) INCLUDE (last_read_seq) из 20260924120000_add_chat_core
-- не моделируется Prisma и вызывал постоянный дрейф schema<->БД (каждый migrate dev
-- генерировал этот DROP). Доступный путь (conversation_id, user_id) покрывает PK;
-- потеря INCLUDE-оптимизации на масштабе штата незаметна. Схема — истина.
DROP INDEX "conversation_members_conversation_id_last_read_seq_idx";

-- AlterTable
-- Watermark трэда (раунд 3): точка «есть новые» на посте канала — чужие ответы
-- с seq > last_read_seq непрочитанны для наблюдателя (author/replier/watcher/mentioned).
ALTER TABLE "thread_participants" ADD COLUMN     "last_read_seq" BIGINT NOT NULL DEFAULT 0;
