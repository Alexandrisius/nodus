-- Канал проекта (#52, Р8): у проекта не больше одного канала. Частичный
-- unique (прецедент conversations_task_unique_key): ручные каналы без
-- project_id не задеты.
CREATE UNIQUE INDEX "conversations_project_channel_unique_key"
  ON "conversations"("project_id")
  WHERE "type" = 'project_channel' AND "project_id" IS NOT NULL;
