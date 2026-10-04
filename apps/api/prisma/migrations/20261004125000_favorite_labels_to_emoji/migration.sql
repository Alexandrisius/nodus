-- Избранное #171, ревизия 04.10: метки = личные эмодзи-реакции (модель
-- Telegram Premium). Формат labels: [{emoji,name}] → ["emoji"] (заметка
-- уходит из контракта; колонка note остаётся — contract-этап отдельно).
-- Прод пуст (фича не развёрнута) — конвертация актуальна только для
-- песочницы; пустой массив и мусор пропускаются.
UPDATE "favorites"
SET "labels" = converted.emojis
FROM (
    SELECT f."user_id", f."message_id",
           COALESCE(jsonb_agg(DISTINCT e->>'emoji'), '[]'::jsonb) AS emojis
    FROM "favorites" f,
         jsonb_array_elements(f."labels") AS e
    WHERE jsonb_typeof(f."labels") = 'array'
    GROUP BY f."user_id", f."message_id"
) AS converted
WHERE "favorites"."user_id" = converted."user_id"
  AND "favorites"."message_id" = converted."message_id"
  AND jsonb_typeof("favorites"."labels") = 'array'
  AND "favorites"."labels" != '[]'::jsonb;
