-- #267: чистка журнала по удалённому сообщению (deleteByMessage: DELETE …
-- WHERE message_id = …) и pack-time guard списков идут по message_id — без
-- индекса каждый purge = seq-scan растущего журнала уведомлений.
CREATE INDEX "notifications_message_id_idx" ON "notifications" ("message_id");
