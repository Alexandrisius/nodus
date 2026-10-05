-- Витрина беседы (#211): стартовое заполнение проекции ссылок и счётчиков
-- по ЖИВЫМ данным. Полный консистентный пересчёт (безопасно повторять):
-- message_links — вставка отсутствующих + чистка строк мёртвых сообщений,
-- conversation_vault_stats — полный пересчёт всех строк. Алгоритм извлечения
-- URL эквивалентен серверному экстрактору messages/link-extractor.ts
-- (https?:// + срез хвостовой пунктуации) — подтверждено зеркальными тестами.

-- Ссылки: тексты живых сообщений → строки проекции (позиция с 0).
INSERT INTO message_links (id, message_id, conversation_id, thread_root_id, position, url, author_id, created_at)
SELECT gen_random_uuid(), m.id, m.conversation_id, m.thread_root_id, u.ord - 1,
       rtrim(u.match[1], '.,;:!?)]}''">'), m.author_id, m.created_at
FROM messages m
CROSS JOIN LATERAL regexp_matches(m.text, 'https?://[^\s]+', 'g') WITH ORDINALITY AS u(match, ord)
WHERE m.deleted_at IS NULL AND NOT m.obliterated AND m.text LIKE '%http%'
ON CONFLICT (message_id, position) DO NOTHING;

-- Ссылки мёртвых сообщений (надгробия/бесследие/правка до нуля) — убрать.
DELETE FROM message_links l
WHERE NOT EXISTS (
  SELECT 1 FROM messages m
  WHERE m.id = l.message_id AND m.deleted_at IS NULL AND NOT m.obliterated
);

-- Счётчики витрины: полный пересчёт (media=kind image, document=kind file,
-- стикеры не считаются; только живые сообщения).
TRUNCATE conversation_vault_stats;
INSERT INTO conversation_vault_stats (conversation_id, media_count, document_count, link_count)
SELECT c.id,
  (SELECT COUNT(*) FROM messages m
     JOIN message_attachments a ON a.message_id = m.id
     WHERE m.conversation_id = c.id AND m.deleted_at IS NULL AND NOT m.obliterated
       AND a.kind = 'image'),
  (SELECT COUNT(*) FROM messages m
     JOIN message_attachments a ON a.message_id = m.id
     WHERE m.conversation_id = c.id AND m.deleted_at IS NULL AND NOT m.obliterated
       AND a.kind = 'file'),
  (SELECT COUNT(*) FROM message_links l WHERE l.conversation_id = c.id)
FROM conversations c;
