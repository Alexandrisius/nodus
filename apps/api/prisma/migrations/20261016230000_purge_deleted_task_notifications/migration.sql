-- Бэкфилл #252: чистка «вечных» уведомлений об удалённых задачах (класс
-- бага #267): у удалённой задачи открыть нечего, гашения нет — строки
-- висели в журнале и тосте «Требуют внимания». Рантаймовую чистку делает
-- подписчик task.deleted; здесь — однократная чистка накопленного.
DELETE FROM notifications n
WHERE n.source_type = 'task'
  AND NOT EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id = n.source_id AND t.deleted_at IS NULL
  );
