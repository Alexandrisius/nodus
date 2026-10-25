/**
 * Изоляция окружения песочницы live-stack (вынесено из live-stack.mjs, I5):
 * чтение .env, имя базы из URL и собственные секреты подписи (#247).
 */
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** Корневой .env (без dotenv-зависимости: простой парсер KEY=VALUE). */
export function loadDotEnv(root) {
  const file = path.join(root, '.env');
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) env[match[1]] = match[2];
  }
  return env;
}

/** Имя базы из DATABASE_URL (pathname, не подстрока: `?x=/nodus_night` не
 *  должен выдавать прод-базу за песочную). */
export function dbName(url) {
  try {
    return new URL(url).pathname.replace(/^\//, '');
  } catch {
    return '';
  }
}

/** Секреты подписи песочницы (#247, security-ревью): НЕ из `.env` — там
 *  прод-значения. С общим JWT_SECRET токен песочницы (тестовые пароли
 *  публичны) принимал бы прод: JwtAuthGuard верит правам из payload.
 *  Генерируются один раз в gitignored `.live-stack/secrets.json`. */
export function sandboxSecrets(dotenv, stateDir) {
  const secretsFile = path.join(stateDir, 'secrets.json');
  const keys = ['JWT_SECRET', 'STORAGE_URL_SECRET'];
  let secrets = {};
  if (fs.existsSync(secretsFile)) secrets = JSON.parse(fs.readFileSync(secretsFile, 'utf8'));
  let changed = false;
  for (const key of keys) {
    if (!secrets[key]) {
      secrets[key] = randomBytes(32).toString('hex');
      changed = true;
    }
    if (dotenv[key] && secrets[key] === dotenv[key]) {
      throw new Error(`секрет песочницы ${key} совпадает с .env (прод) — удалите ${secretsFile}`);
    }
  }
  if (changed) {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(secretsFile, JSON.stringify(secrets, null, 2));
  }
  return secrets;
}
