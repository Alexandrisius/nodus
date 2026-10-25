-- #380 — первый писатель журнала; таблица пуста. result_id — id ревизии итога (uuid),
-- а не исход; answers (#381) — массив. Мусор в result_id уронит миграцию громко.
ALTER TABLE "transition_records" ALTER COLUMN "result_id" TYPE UUID USING "result_id"::uuid;
ALTER TABLE "transition_records" ALTER COLUMN "answers" SET DEFAULT '[]';
