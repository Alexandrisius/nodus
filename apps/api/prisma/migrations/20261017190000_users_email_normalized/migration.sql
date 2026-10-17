-- Email сотрудника без учёта регистра (#321). Вход (zod-контракты) уже
-- нормализует адрес (trim + lower); здесь — история и гарантия на уровне БД.
-- Вместо индекса по выражению lower(email) (Prisma его не описывает — вечный
-- дрейф схемы, gotcha INCLUDE-индекса) — CHECK «хранится только
-- нормализованная форма»: тогда обычный unique users_email_key уже
-- регистронезависим, а поиск where email = $1 идёт по нему же.

-- 1. Дубли в другом регистре сливать автоматически нельзя (это разные учётки
--    с паролями и историей) — миграция падает громко со списком адресов.
DO $$
DECLARE
  dups TEXT;
BEGIN
  SELECT string_agg(normalized, ', ') INTO dups
  FROM (
    SELECT lower(btrim(email)) AS normalized
    FROM users
    GROUP BY 1
    HAVING count(*) > 1
  ) d;
  IF dups IS NOT NULL THEN
    RAISE EXCEPTION 'users.email: дубли без учёта регистра — разрешить вручную до миграции: %', dups;
  END IF;
END $$;

-- 2. Backfill: исторические адреса — к нормализованной форме.
UPDATE users SET email = lower(btrim(email)) WHERE email <> lower(btrim(email));

-- 3. Гарантия: в users.email живёт только нормализованный адрес.
ALTER TABLE users ADD CONSTRAINT users_email_normalized CHECK (email = lower(btrim(email)));
