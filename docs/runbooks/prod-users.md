# Runbook: создание сотрудника на проде

Учётная запись реального сотрудника на прод-контуре (nodus.by). Тестовые учётки песочницы сюда не относятся (они живут только в `nodus_night`, навык `nodus-dev-testing`).

1. `POST /api/v1/directory/users` под админом (вход `admin@nodus.by`): обязательный заголовок `Idempotency-Key` (новый uuidgen на каждый вызов), пароль 12+ символов, только ASCII/url-safe (gotchas «не-ASCII в секретах»); логин — рабочий email в нижнем регистре (нормализация на входе, ADR про регистронезависимость).
2. Роль (`employee`/`head`/`admin`) — по `roleIds`; id ролей перечитать из БД, не хардкодить: `docker exec nodus_postgres psql -U <pguser> -d nodus -c "select id, code from roles;"`.
3. Добавление в канал «Новости» — прямой INSERT в `conversation_members` с явным `now()` (у `updated_at` нет DEFAULT в БД — значение ставит клиент Prisma, gotchas).
4. Проверка: логин под новой учёткой на nodus.by; первую смену пароля сотрудник делает сам.
