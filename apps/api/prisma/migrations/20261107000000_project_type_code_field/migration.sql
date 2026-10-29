-- Поле «Шифр» как системное поле формы типа проекта (#52, вердикт владельца
-- 07.11.2026): у «Договора» шифр обязателен, у «Темы» поля нет. Полный набор
-- полей типа (системные + кастомные) придёт схемой формы в «Автоматизации»
-- (#38/#468) — здесь только политика одного системного поля, чтобы окно
-- создания не показывало шифр всем типам подряд.
ALTER TABLE "project_types"
  ADD COLUMN "code_field" TEXT NOT NULL DEFAULT 'optional';

ALTER TABLE "project_types"
  ADD CONSTRAINT "project_types_code_field_check"
  CHECK ("code_field" IN ('hidden', 'optional', 'required'));

-- Сид-типы (#52): «Договор» — шифр обязателен, «Тема» — шифра нет.
UPDATE "project_types" SET "code_field" = 'required'
WHERE "id" = '11111111-1111-4111-8111-111111111111';

UPDATE "project_types" SET "code_field" = 'hidden'
WHERE "id" = '22222222-2222-4222-8222-222222222222';
