#!/usr/bin/env node
/** Night-пользователи песочницы live-stack (#178): night-a/night-b для живых
 *  проб и приёмки (двухпользовательские сценарии: WS-догон, реакции, треды).
 *  Идемпотентно: существующим перегенерирует пароль и имя.
 *
 *  БД — ТОЛЬКО ИЗОЛИРОВАННАЯ nodus_night (из .env заменой базы); другая
 *  база — отказ (пароли публичны, security-ревью #247).
 *
 *  Пароль — тестовый секрет одноразовой песочницы, не репо-секрет: пользователи
 *  живут только в nodus_night и сбрасываются вместе с ней. */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'apps/api/package.json'));
const pg = require('pg');
const argon2 = require('argon2');

// Пароли — единый источник тестовых пользователей сред (#247).
const USERS = JSON.parse(readFileSync(path.join(ROOT, 'tests/e2e/e2e-users.json'), 'utf8'));
const url =
  process.env.DATABASE_URL ??
  (() => {
    const env = readFileSync(path.join(ROOT, '.env'), 'utf8');
    const m = env.match(/^DATABASE_URL=(.+)$/m);
    if (!m) throw new Error('нет DATABASE_URL ни в env, ни в .env');
    return m[1].trim().replace(/\/nodus(\?|$)/, '/nodus_night$1');
  })();

// Публичный пароль — только в песочной базе (security-ревью #247): прод-база
// с известными учётками = вход для любого, кто читал репозиторий.
if (new URL(url).pathname !== '/nodus_night') {
  throw new Error('night-users: только БД nodus_night (публичные тестовые пароли)');
}
const client = new pg.Client({ connectionString: url });
await client.connect();
async function mk({ email, password }, first, last) {
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rowCount > 0) {
    await client.query(
      "UPDATE users SET password_hash = $1, status = 'active', display_name = $2 WHERE id = $3",
      [hash, `${first} ${last}`, existing.rows[0].id],
    );
    console.log('reset', email, existing.rows[0].id);
    return;
  }
  const res = await client.query(
    "INSERT INTO users (id, email, password_hash, last_name, first_name, display_name, status, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'active', now(), now()) RETURNING id",
    [email, hash, last, first, `${first} ${last}`],
  );
  console.log('created', email, res.rows[0].id);
}
await mk(USERS.nightA, 'Анна', 'Ночная');
await mk(USERS.nightB, 'Борис', 'Ночной');
// Роль admin: песочница — место приёмки владельца, night-учёткам нужен
// полный доступ (task.workflow_manage #378: типы/маршруты/публикация;
// task.manage_any/override_gate: любые задачи и обход гейтов). БД только
// nodus_night — публичные пароли админов живут в одноразовой песочнице
// (security-ревью #247: на проде скрипт не запускается вовсе).
await client.query(`
  INSERT INTO user_roles (user_id, role_id)
  SELECT u.id, r.id FROM users u, roles r
  WHERE u.email LIKE 'night-%@nodus.local' AND r.code = 'admin'
  ON CONFLICT DO NOTHING
`);
// Страховка ролей/флагов при ручном запуске (обычно сеет prisma/seed).
await client.query(`
  INSERT INTO roles (id, code, name, is_system, created_at, updated_at)
  VALUES (gen_random_uuid(), 'employee', 'Сотрудник', true, now(), now())
  ON CONFLICT (code) DO NOTHING
`);
await client.query(`
  INSERT INTO role_permissions (role_id, permission)
  SELECT r.id, p FROM roles r, unnest(ARRAY['directory.read', 'task.create']) AS p
  WHERE r.code = 'employee'
  ON CONFLICT DO NOTHING
`);
// Фича-флаги модулей: без строк гвард отдаёт 404 на маршрутах чата. Флаги
// сеет prisma/seed (бутстрап live-stack гоняет его перед этим скриптом, #247);
// здесь — страховка для ручного запуска скрипта.
await client.query(`
  INSERT INTO feature_flags (key, enabled, created_at, updated_at)
  VALUES ('chat', true, now(), now()), ('notifications', true, now(), now()),
    ('tasks', true, now(), now())
  ON CONFLICT (key) DO NOTHING
`);
await client.end();
