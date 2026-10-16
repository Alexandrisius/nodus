-- Модуль «Задачи» готов к пилоту (#311): флаг включается по умолчанию в
-- любой установке («одна команда», ADR-0002). Seed на проде не гоняется —
-- без строки флага весь /tasks отвечал 404 (находка выкатки 17.10.2026).
-- ON CONFLICT DO NOTHING: явно выключенный администратором флаг не трогаем.
INSERT INTO "feature_flags" ("key", "enabled", "scope", "created_at", "updated_at")
VALUES ('tasks', true, 'global', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
