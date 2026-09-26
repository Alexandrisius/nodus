#!/usr/bin/env node
/**
 * Генератор мира нагрузки #117: BOT_COUNT ботов-сотрудников (password_hash
 * наследует админ — login-storm гоняет честный argon2) + 10 командных бесед
 * по BOT_COUNT/10 участников + общий канал на всех. Беседы и юзеры пишутся
 * в прод-БД напрямую (run/bots.sql → docker exec psql) — мимо outbox: события
 * conversation_created не нужны, сокеты JOIN-ят беседы по членству в PG.
 *
 * JWT ботов подписываются тем же HS256-секретом (payload-формат token.service:
 * sub/email/displayName/permissions/sid; permissions копируются у реального
 * админа). Gateway и api проверяют подпись+exp — сессии не смотрят (README
 * gateway). Токены живут в run/world.json — каталог в .gitignore.
 *
 * Запуск: node tools/bots.mjs   (cwd = apps/gateway/perf)
 * Затем:  docker exec -i nodus_postgres psql -U nodus -d nodus < run/bots.sql
 * Вычистка мира: docker exec -i nodus_postgres psql -U nodus -d nodus < run/cleanup.sql
 */
import { createHmac, randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const API = process.env.API ?? 'http://127.0.0.1:3001';
const BOT_COUNT = Number(process.env.BOTS ?? 300);
const TEAMS = 10;
const TOKEN_TTL_S = Number(process.env.TOKEN_TTL_S ?? 30 * 3600);
// Пароль не хардкодится (секреты — только .env/окружение): передавать PASSWORD=…
const ADMIN_PASSWORD = process.env.PASSWORD ?? '';
const PG = 'docker exec -i nodus_postgres psql -U nodus -d nodus';

function loadEnv() {
  // Корневой .env монорепо (секреты — только там; кириллица/спецсимволы ок).
  const raw = readFileSync(new URL('../../../../.env', import.meta.url), 'utf8');
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !line.trim().startsWith('#')) {
      // кавычки значений и inline-комментарии — как docker compose
      env[m[1]] = m[2]
        .trim()
        .replace(/^["']|["']$/g, '')
        .split(' #')[0]
        .trim();
    }
  }
  return env;
}

const b64url = (buf) =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = (obj) => b64url(Buffer.from(JSON.stringify(obj)));

function signJwt(payload, secret) {
  const head = enc({ alg: 'HS256', typ: 'JWT' });
  const iat = Math.floor(Date.now() / 1000);
  const body = enc({ ...payload, iat, exp: iat + TOKEN_TTL_S });
  const sig = b64url(createHmac('sha256', secret).update(`${head}.${body}`).digest());
  return `${head}.${body}.${sig}`;
}

const env = loadEnv();
if (!env.JWT_SECRET) throw new Error('JWT_SECRET не найден в корневом .env');

const login = await fetch(`${API}/api/v1/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@nodus.by', password: ADMIN_PASSWORD }),
});
if (!login.ok) throw new Error(`admin login failed: ${login.status} ${await login.text()}`);
const { accessToken } = await login.json();
const adminPayload = JSON.parse(
  Buffer.from(accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
    'utf8',
  ),
);
console.log(
  `admin ok: sub=${adminPayload.sub.slice(0, 8)}… permissions=${adminPayload.permissions.length}`,
);

const adminHash = execSync(
  `${PG} -tAc "SELECT password_hash FROM users WHERE id='${adminPayload.sub}'"`,
  { encoding: 'utf8' },
).trim();
if (!adminHash.startsWith('$argon2')) throw new Error(`unexpected hash: ${adminHash.slice(0, 20)}`);

const bots = [];
const teams = Array.from({ length: TEAMS }, (_, j) => ({
  id: randomUUID(),
  title: `k6-team-${j}`,
}));
const common = { id: randomUUID(), title: 'k6-common' };

for (let i = 0; i < BOT_COUNT; i += 1) {
  const id = randomUUID();
  const email = `k6bot-${String(i).padStart(3, '0')}@load.nodus.by`;
  const team = teams[i % TEAMS];
  bots.push({
    id,
    email,
    token: signJwt(
      {
        sub: id,
        email,
        displayName: `Бот ${String(i).padStart(3, '0')}`,
        permissions: adminPayload.permissions,
        sid: randomUUID(),
      },
      env.JWT_SECRET,
    ),
    teamId: team.id,
    n: i,
  });
}

const q = (s) => `'${s.replace(/'/g, "''")}'`;
const perms =
  '{"changeInfo":"admin","addMembers":"member","removeMembers":"admin","post":"member","manageSettings":"owner"}';
const convRow = (c) =>
  `('${c.id}', 'group', ${q(c.title)}, ${q(perms)}::jsonb, '${adminPayload.sub}', now(), now())`;

let sql =
  '-- k6-мир нагрузки #117 (генератор tools/bots.mjs); вычистка — run/cleanup.sql\nBEGIN;\n';
sql += `INSERT INTO users (id, email, password_hash, last_name, first_name, display_name, status, created_at, updated_at)\nVALUES\n`;
sql += bots
  .map(
    (b) =>
      `  ('${b.id}', ${q(b.email)}, ${q(adminHash)}, 'Бот', 'k6-${b.n}', ${q(`Бот ${String(b.n).padStart(3, '0')}`)}, 'active', now(), now())`,
  )
  .join(',\n');
sql += ';\n';
sql += `INSERT INTO conversations (id, type, title, permissions, created_by, created_at, updated_at)\nVALUES\n`;
sql += [...teams, common].map(convRow).join(',\n');
sql += ';\n';
sql += `INSERT INTO conversation_members (conversation_id, user_id, role, updated_at)\nVALUES\n`;
sql += bots
  .flatMap((b) => [
    `('${b.teamId}', '${b.id}', 'member', now())`,
    `('${common.id}', '${b.id}', 'member', now())`,
  ])
  .join(',\n');
sql += ';\nCOMMIT;\n';

let cleanup = `-- Вычистка k6-мира: беседы (каскадом тянут members), затем боты\nBEGIN;\n`;
cleanup += `DELETE FROM conversations WHERE title LIKE 'k6-team-%' OR title = 'k6-common';\n`;
cleanup += `DELETE FROM users WHERE email LIKE '%@load.nodus.by';\n`;
cleanup += 'COMMIT;\n';

mkdirSync(new URL('../run/', import.meta.url), { recursive: true });
writeFileSync(new URL('../run/bots.sql', import.meta.url), sql);
writeFileSync(new URL('../run/cleanup.sql', import.meta.url), cleanup);
writeFileSync(
  new URL('../run/world.json', import.meta.url),
  JSON.stringify({
    adminId: adminPayload.sub,
    commonId: common.id,
    teams: teams.map((t) => t.id),
    bots,
  }),
);
console.log(
  `готово: ${bots.length} ботов, ${teams.length} команд + общий канал → run/ (bots.sql, world.json, cleanup.sql)`,
);
