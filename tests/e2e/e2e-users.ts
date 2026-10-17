import { readFileSync } from 'node:fs';

/**
 * Тестовые пользователи e2e (#247): дефолты — единый источник
 * `e2e-users.json` (его же читают CI-сид и сид песочницы live-stack), env —
 * только переопределение под другой стенд. Любой `*-live` спек идёт против
 * песочницы и CI без правки спека.
 */
interface E2eUser {
  email: string;
  password: string;
}

const users = JSON.parse(
  readFileSync(new URL('./e2e-users.json', import.meta.url), 'utf8'),
) as Record<'admin' | 'second' | 'nightA' | 'nightB', E2eUser>;

/** Сидовый админ (`admin@nodus.by`). */
export const ADMIN: E2eUser = {
  email: process.env.E2E_ADMIN_EMAIL ?? users.admin.email,
  password: process.env.E2E_ADMIN_PASSWORD ?? users.admin.password,
};

/** Второй сидовый сотрудник (демо-пароль сида). */
export const SECOND: E2eUser = {
  email: process.env.E2E_SECOND_EMAIL ?? users.second.email,
  password: process.env.E2E_SECOND_PASSWORD ?? users.second.password,
};

/** Night-пользователи проб (алиасы песочницы, scripts/night-users.mjs). */
export const NIGHT_A: E2eUser = users.nightA;
export const NIGHT_B: E2eUser = users.nightB;
