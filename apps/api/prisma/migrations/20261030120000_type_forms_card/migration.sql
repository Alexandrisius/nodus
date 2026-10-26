-- #432 (ADR-0024 п.5, «Дополнение (#432)»): конфигурация типа процесса —
-- состав карточки и доступ к типу; форма создания как раздел документа
-- маршрута; привязка атрибутов к типам процессов.
--
-- Expand-only: новые колонки с умолчаниями и новая таблица; существующие
-- данные не переписываются, кроме БЭКФИЛЛА привязок (он только добавляет
-- строки — без него привязка спрятала бы уже заполненные атрибуты).
-- Откат: DROP TABLE field_definition_types; ALTER TABLE ... DROP COLUMN.

ALTER TABLE "process_types" ADD COLUMN "config" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "workflows" ADD COLUMN "creation" JSONB;

CREATE TABLE "field_definition_types" (
    "definition_id" UUID NOT NULL,
    "process_type_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_definition_types_pkey" PRIMARY KEY ("definition_id","process_type_id")
);

-- Атрибуты типа читаются на каждой карточке и форме (обратный индекс);
-- по definition_id индекс даёт первичный ключ (ведущая колонка).
CREATE INDEX "field_definition_types_process_type_id_idx" ON "field_definition_types"("process_type_id");

ALTER TABLE "field_definition_types" ADD CONSTRAINT "field_definition_types_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "field_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "field_definition_types" ADD CONSTRAINT "field_definition_types_process_type_id_fkey" FOREIGN KEY ("process_type_id") REFERENCES "process_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Бэкфилл 1: значения, уже записанные в задачах. Тип задачи — источник
-- привязки: атрибут с значением обязан остаться видимым в карточке этой
-- задачи после введения привязок (иначе заполненное «пропадёт» из формы).
INSERT INTO "field_definition_types" ("definition_id", "process_type_id")
SELECT DISTINCT fd."id", pt."id"
FROM "tasks" t
JOIN "process_types" pt ON pt."id" = t."type_id"
CROSS JOIN LATERAL jsonb_object_keys(t."custom_fields") AS k(key)
JOIN "field_definitions" fd ON fd."id"::text = k.key AND fd."scope" = 'task'
WHERE t."deleted_at" IS NULL
ON CONFLICT DO NOTHING;

-- Бэкфилл 2: использование в ОПУБЛИКОВАННЫХ маршрутах — форма создания
-- (узел «Создание»), окна переходов (раздел «Поля») и условия «Заполнены
-- поля». Тип берётся через схему «тип → маршрут»: привязать атрибут к типу,
-- у которого он стоит в работающем окне, обязательно, иначе публикация
-- существующего маршрута станет невалидной.
WITH used AS (
  SELECT DISTINCT se."process_type_id" AS type_id, f ->> 'key' AS key
  FROM "workflows" w
  JOIN "workflow_scheme_entries" se ON se."workflow_id" = w."id"
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(w."creation" -> 'fields', '[]'::jsonb)) f
  WHERE w."published_at" IS NOT NULL
    AND f ->> 'key' LIKE 'cf.%'
  UNION
  SELECT DISTINCT se."process_type_id", f #>> '{}'
  FROM "workflows" w
  JOIN "workflow_scheme_entries" se ON se."workflow_id" = w."id"
  JOIN "workflow_transitions" t ON t."workflow_id" = w."id" AND t."archived_at" IS NULL
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(t."form" -> 'sections', '[]'::jsonb)) s
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s -> 'fields', '[]'::jsonb)) f
  WHERE w."published_at" IS NOT NULL
    AND t."form" ->> 'enabled' = 'true'
    AND s ->> 'kind' = 'fields'
  UNION
  SELECT DISTINCT se."process_type_id", f #>> '{}'
  FROM "workflows" w
  JOIN "workflow_scheme_entries" se ON se."workflow_id" = w."id"
  JOIN "workflow_transitions" t ON t."workflow_id" = w."id" AND t."archived_at" IS NULL
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(t."rules" -> 'validators', '[]'::jsonb)) v
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(v -> 'fields', '[]'::jsonb)) f
  WHERE w."published_at" IS NOT NULL
    AND v ->> 'kind' = 'fields_required'
)
INSERT INTO "field_definition_types" ("definition_id", "process_type_id")
SELECT DISTINCT fd."id", u.type_id
FROM used u
JOIN "process_types" pt ON pt."id" = u.type_id
JOIN "field_definitions" fd ON u.key = 'cf.' || fd."id"::text AND fd."scope" = pt."category"
ON CONFLICT DO NOTHING;
