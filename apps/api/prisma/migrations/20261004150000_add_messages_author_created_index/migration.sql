-- #177: индекс под счётчик дневного лимита важных (GET /chat/urgent/policy
-- и проверка send-urgent.policy): count/oldest по author_id + created_at
-- без скана всей таблицы сообщений. Моделируемый индекс (gotcha #104).
-- CreateIndex
CREATE INDEX "messages_author_id_created_at_idx" ON "messages"("author_id", "created_at");
