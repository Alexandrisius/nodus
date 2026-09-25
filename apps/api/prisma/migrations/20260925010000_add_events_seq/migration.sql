-- Глобальный монотонный порядок событий: seq для WS-envelope realtime (#104).
-- Sequence + volatile DEFAULT: существующие строки получают значения при
-- ADD COLUMN (PostgreSQL вычисляет nextval построчно при перезаписи таблицы),
-- новые строки — из sequence автоматически. Присваивает только БД.
CREATE SEQUENCE "events_seq_seq" AS BIGINT;
ALTER TABLE "events" ADD COLUMN "seq" BIGINT NOT NULL DEFAULT nextval('events_seq_seq');
ALTER SEQUENCE "events_seq_seq" OWNED BY "events"."seq";

-- Точка входа издателя fanout (ORDER BY seq) и уникальность порядка.
CREATE UNIQUE INDEX "events_seq_key" ON "events"("seq");
