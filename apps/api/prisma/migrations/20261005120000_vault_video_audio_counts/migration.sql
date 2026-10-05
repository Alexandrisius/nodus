-- Витрина #211, ревизия владельца 05.10: категории «Видео» и «Аудио»
-- выделяются из файлов по mime (модель Telegram). Колонка media_count
-- переименована в image_count (категория «Картинки»), добавлены video/audio;
-- ниже — идемпотентный полный пересчёт всех строк (паттерн vault_backfill,
-- классификация эквивалентна vaultKindOf: kind='image' → image, файлы —
-- по префиксу mime, стикеры не считаются; только живые сообщения).

ALTER TABLE "conversation_vault_stats" RENAME COLUMN "media_count" TO "image_count";
ALTER TABLE "conversation_vault_stats" ADD COLUMN "video_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "conversation_vault_stats" ADD COLUMN "audio_count" INTEGER NOT NULL DEFAULT 0;

TRUNCATE conversation_vault_stats;
INSERT INTO conversation_vault_stats (conversation_id, image_count, video_count, audio_count, document_count, link_count)
SELECT c.id,
  (SELECT COUNT(*) FROM messages m
     JOIN message_attachments a ON a.message_id = m.id
     WHERE m.conversation_id = c.id AND m.deleted_at IS NULL AND NOT m.obliterated
       AND a.kind = 'image'),
  (SELECT COUNT(*) FROM messages m
     JOIN message_attachments a ON a.message_id = m.id
     WHERE m.conversation_id = c.id AND m.deleted_at IS NULL AND NOT m.obliterated
       AND a.kind = 'file' AND a.mime LIKE 'video/%'),
  (SELECT COUNT(*) FROM messages m
     JOIN message_attachments a ON a.message_id = m.id
     WHERE m.conversation_id = c.id AND m.deleted_at IS NULL AND NOT m.obliterated
       AND a.kind = 'file' AND a.mime LIKE 'audio/%'),
  (SELECT COUNT(*) FROM messages m
     JOIN message_attachments a ON a.message_id = m.id
     WHERE m.conversation_id = c.id AND m.deleted_at IS NULL AND NOT m.obliterated
       AND a.kind = 'file' AND a.mime NOT LIKE 'video/%' AND a.mime NOT LIKE 'audio/%'),
  (SELECT COUNT(*) FROM message_links l WHERE l.conversation_id = c.id)
FROM conversations c;
