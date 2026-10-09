-- Бэкфилл #267: чистка накопленных «вечных» уведомлений об удалённых
-- сообщениях. Удалённое до прочтения сообщение физически не прочитывается
-- (obliterated-строки нет во вьюпорте → watermark не накроет source_seq),
-- ручного гашения у чат-уведомлений нет — такие строки висели вечно
-- (у тестовых пользователей накопилось по сотне+). Рантаймовую чистку
-- делает подписчик chat.message_deleted; здесь — однократная чистка
-- накопленного. Предикат зеркален рантаймовому: любое удаление (надгробие
-- и бесследно), read-строки тоже — текст сообщения исчез, уведомление
-- о нём ценности не имеет.
DELETE FROM notifications n
WHERE n.message_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM messages m
    WHERE m.id = n.message_id AND m.deleted_at IS NOT NULL
  );

-- Гард: после чистки «битых» строк не остаётся (список/сводка дополнительно
-- фильтруют их в рантайме — страховка от гонки переупорядочивания событий).
DO $$
DECLARE
  leftovers int;
BEGIN
  SELECT COUNT(*) INTO leftovers FROM notifications n
  WHERE n.message_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM messages m
      WHERE m.id = n.message_id AND m.deleted_at IS NOT NULL
    );
  IF leftovers > 0 THEN
    RAISE EXCEPTION 'notifications for deleted messages remain: %', leftovers;
  END IF;
END $$;
