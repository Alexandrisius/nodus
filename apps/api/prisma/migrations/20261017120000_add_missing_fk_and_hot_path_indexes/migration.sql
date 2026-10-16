-- Ночной аудит БД (#317): индексы под реальные запросы и FK без индексов.
-- Expand-only — только CREATE INDEX, данные не трогаются. PostgreSQL не
-- создаёт индексы на FK сам: без них каждое удаление/архивация родителя
-- (Restrict/SetNull/Cascade-проверка) и каждый джойн по FK — seq scan.
-- Таблицы пока малы — обычный CREATE INDEX (в транзакции миграции) берёт
-- короткую блокировку записи; на больших объёмах — CONCURRENTLY отдельно.

-- Горячие пути мессенджера.
-- Гейт доступа к файлу вложения: WHERE file_id = ? на каждую отдачу.
CREATE INDEX "message_attachments_file_id_idx" ON "message_attachments"("file_id");
-- Чистка закладок при удалении сообщения: WHERE message_id = ? + каскад FK.
CREATE INDEX "favorites_message_id_idx" ON "favorites"("message_id");
CREATE INDEX "user_sticker_packs_pack_id_idx" ON "user_sticker_packs"("pack_id");

-- Outbox-поллер: WHERE published_at IS NULL ORDER BY seq — парциальный
-- индекс растёт только с хвостом неопубликованных (модель
-- events_fanout_pending_idx; Prisma partial-индексы не выражает).
CREATE INDEX "events_dispatch_pending_idx" ON "events"("seq") WHERE "published_at" IS NULL;

-- Задачи: FK Restrict-проверки архивации типа/маршрута, фильтр по типу,
-- трудозатраты по проекту (отчёт ступени 3 M4, I14).
CREATE INDEX "tasks_type_id_idx" ON "tasks"("type_id");
CREATE INDEX "tasks_workflow_id_idx" ON "tasks"("workflow_id");
CREATE INDEX "time_entries_project_id_date_idx" ON "time_entries"("project_id", "date");
CREATE INDEX "workflow_transitions_to_stage_id_idx" ON "workflow_transitions"("to_stage_id");
CREATE INDEX "workflow_scheme_entries_task_type_id_idx" ON "workflow_scheme_entries"("task_type_id");
CREATE INDEX "workflow_scheme_entries_workflow_id_idx" ON "workflow_scheme_entries"("workflow_id");

-- Оргструктура и RBAC: FK SetNull/Cascade-проверки.
CREATE INDEX "users_position_id_idx" ON "users"("position_id");
CREATE INDEX "users_legal_department_id_idx" ON "users"("legal_department_id");
CREATE INDEX "users_legal_position_id_idx" ON "users"("legal_position_id");
CREATE INDEX "departments_parent_id_idx" ON "departments"("parent_id");
CREATE INDEX "departments_head_id_idx" ON "departments"("head_id");
CREATE INDEX "departments_deputy_id_idx" ON "departments"("deputy_id");
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");
