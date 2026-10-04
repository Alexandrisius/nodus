-- #177 «Важные сообщения»: флаг requireAck (чекбокс «Требовать подтверждения»).
-- Повторы уведомления до ack — только для requireAck-строк; важное без
-- подтверждения гасится прочтением. Expand-only (две колонки с дефолтом).

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "require_ack" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "require_ack" BOOLEAN NOT NULL DEFAULT false;

-- Бэкфилл: старые срочные сохраняют семантику повторов #100 («напоминать
-- до ознакомления») — существующие urgent-сообщения и их строки журнала
-- становятся requireAck.
UPDATE "messages" SET "require_ack" = true WHERE "urgent";
UPDATE "notifications" SET "require_ack" = true WHERE "priority" = 'urgent';
