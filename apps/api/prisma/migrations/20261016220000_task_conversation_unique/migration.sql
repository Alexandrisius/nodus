-- Чат задачи (#252): одна беседа type='task' на задачу — арбитр find-or-create
-- (обработчик task.created и GET by-task гоняются; ON CONFLICT ... DO NOTHING).
CREATE UNIQUE INDEX "conversations_task_unique_key" ON "conversations"("task_id") WHERE "type" = 'task' AND "task_id" IS NOT NULL;
