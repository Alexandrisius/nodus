#!/usr/bin/env node
/** Night-пользователи песочницы live-stack (#178): night-a/night-b для живых
 *  проб и приёмки (двухпользовательские сценарии: WS-догон, реакции, треды).
 *  Идемпотентно: существующим перегенерирует пароль и имя.
 *
 *  БД по умолчанию — ИЗОЛИРОВАННАЯ nodus_night (из .env заменой базы);
 *  прод-база допустима только явным DATABASE_URL (сделать это случайностью
 *  нельзя — тот же принцип, что гвард live-stack).
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

const PASS = 'Night-Probe-100!';
const url =
  process.env.DATABASE_URL ??
  (() => {
    const env = readFileSync(path.join(ROOT, '.env'), 'utf8');
    const m = env.match(/^DATABASE_URL=(.+)$/m);
    if (!m) throw new Error('нет DATABASE_URL ни в env, ни в .env');
    return m[1].trim().replace(/\/nodus(\?|$)/, '/nodus_night$1');
  })();

const client = new pg.Client({ connectionString: url });
await client.connect();
async function mk(email, first, last) {
  const hash = await argon2.hash(PASS, { type: argon2.argon2id });
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
await mk('night-a@nodus.local', 'Анна', 'Ночная');
await mk('night-b@nodus.local', 'Борис', 'Ночной');
// Роль employee (directory.read): пикеры людей и журнал сотрудников в
// песочнице работают как у пилотов — без роли справочник отдаёт 403 и окна
// «Добавить участников»/создания чата выглядят пустыми (приёмка #186).
// Роли сеет только prisma/seed (бутстрап песочницы его не гоняет) —
// создаём минимальную роль здесь, идемпотентно.
await client.query(`
  INSERT INTO roles (id, code, name, is_system, created_at, updated_at)
  VALUES (gen_random_uuid(), 'employee', 'Сотрудник', true, now(), now())
  ON CONFLICT (code) DO NOTHING
`);
await client.query(`
  INSERT INTO role_permissions (role_id, permission)
  SELECT r.id, 'directory.read' FROM roles r WHERE r.code = 'employee'
  ON CONFLICT DO NOTHING
`);
await client.query(`
  INSERT INTO user_roles (user_id, role_id)
  SELECT u.id, r.id FROM users u, roles r
  WHERE u.email LIKE 'night-%@nodus.local' AND r.code = 'employee'
  ON CONFLICT DO NOTHING
`);
// Фича-флаги модулей: прод держит chat/notifications включёнными, свежая
// nodus_night — пустая таблица (флаги сеет только prisma/seed, бутстрап его
// не гоняет) — без строк гвард отдаёт 404 на маршрутах чата.
await client.query(`
  INSERT INTO feature_flags (key, enabled, created_at, updated_at)
  VALUES ('chat', true, now(), now()), ('notifications', true, now(), now())
  ON CONFLICT (key) DO NOTHING
`);
await client.end();
