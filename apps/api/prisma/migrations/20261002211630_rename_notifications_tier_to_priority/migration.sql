-- Приоритеты уведомлений (#189, ADR-0017): ось важности отвязана от смысла
-- события. Колонка tier → priority; значения перемигрированы 1:1 с сохранением
-- поведения (urgent→urgent, personal→high, action→medium, background→low).
-- Индексы переименованы вслед за полем — схема = истина, дрейфа нет.
ALTER TABLE "notifications" RENAME COLUMN "tier" TO "priority";

UPDATE "notifications" SET "priority" = CASE "priority"
    WHEN 'urgent' THEN 'urgent'
    WHEN 'personal' THEN 'high'
    WHEN 'action' THEN 'medium'
    WHEN 'background' THEN 'low'
END;

ALTER INDEX "notifications_source_id_tier_ack_at_idx" RENAME TO "notifications_source_id_priority_ack_at_idx";
ALTER INDEX "notifications_tier_read_at_created_at_idx" RENAME TO "notifications_priority_read_at_created_at_idx";
