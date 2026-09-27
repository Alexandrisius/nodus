-- AlterTable
ALTER TABLE "events" ADD COLUMN     "fanout_at" TIMESTAMPTZ;

-- Горячий путь поллера realtime-фанута: WHERE fanout_at IS NULL ORDER BY seq.
-- Парциальный индекс: в индексе живут только неопубликованные строки (мгновенный
-- хвост таблицы), Prisma partial-индексы не моделирует (audit #123).
CREATE INDEX "events_fanout_pending_idx" ON "events"("seq") WHERE "fanout_at" IS NULL;
