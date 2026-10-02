#!/usr/bin/env node
/**
 * Песочница агента — контур разработки ветки (ADR-0002, карта портов в
 * AGENTS.md): api :3011 + gateway :3012 + web preview :4173 (non-mock).
 * Живой стек для приёмки владельцем и локальных e2e; прод-контейнеры docker
 * НЕ трогает. PID-файл .live-stack/pids.json убивает «сирот» прошлых сессий:
 * перед up порты проверяются, чужой процесс на порту = громкая ошибка, а не
 * молчаливый EADDRINUSE свежеподнятого.
 *
 * Команды: up | down | status (pnpm live-stack <команда>).
 */
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_DIR = path.join(ROOT, '.live-stack');
const PID_FILE = path.join(STATE_DIR, 'pids.json');

const PORTS = { api: 3011, gateway: 3012, web: 4173 };
const HEALTH = {
  api: 'http://127.0.0.1:3011/api/v1/health/ready',
  gateway: 'http://127.0.0.1:3012/health',
  web: 'http://127.0.0.1:4173/',
};

/** Корневой .env (без dotenv-зависимости: простой парсер KEY=VALUE). */
function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) env[match[1]] = match[2];
  }
  return env;
}

/** Прослушивает ли кто-то порт (connect-проба; ошибка соединения = свободен). */
function portBusy(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

function pidAlive(pid) {
  if (!Number.isInteger(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPids() {
  try {
    return JSON.parse(fs.readFileSync(PID_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

async function waitHealthy(name, url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch {
      /* ещё поднимается */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(
    `${name} did not become healthy in ${Math.round(timeoutMs / 1000)}s (${url}) - see .live-stack/${name}.log`,
  );
}

/** Запуск: прямой node-процесс без shell-цепочек (PID = сам сервис). */
function startService(name, args, env, cwd = ROOT) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const log = fs.openSync(path.join(STATE_DIR, `${name}.log`), 'w');
  const child = spawn(process.execPath, args, {
    cwd,
    env,
    detached: true,
    stdio: ['ignore', log, log],
  });
  child.unref();
  return child.pid;
}

function vitePreviewBin() {
  // Резолв из пакета web (pnpm-симлинки) — без pnpm/cmd-цепочек в процессах.
  const require = createRequire(path.join(ROOT, 'apps/web/package.json'));
  return path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js');
}

function run(command, args = [], env = process.env) {
  const r = spawnSync(command, args, { cwd: ROOT, shell: true, stdio: 'inherit', env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

/** Идемпотентный бутстрап изолированной БД песочницы (#178): создать
 *  nodus_night, если нет -> применить миграции -> night-пользователи для
 *  проб (scripts/night-users.mjs). Работает и как авто-шаг `up`, и как
 *  отдельная команда `pnpm live-stack bootstrap`. */
function bootstrapNight(env) {
  const user = env.POSTGRES_USER ?? 'nodus';
  const probe = spawnSync(
    `docker exec nodus_postgres psql -U ${user} -tAc "SELECT 1 FROM pg_database WHERE datname='nodus_night'"`,
    { shell: true, encoding: 'utf8' },
  );
  if (probe.status !== 0) {
    console.warn(
      'sandbox: не удалось проверить nodus_night через docker (docker не запущен?).\n' +
        'Продолжаю — если api не станет healthy, см. навык nodus-dev-testing (bootstrap).',
    );
    return;
  }
  if (probe.stdout.trim() !== '1') {
    console.log('sandbox: создаю изолированную БД nodus_night (однократно)...');
    const created = spawnSync(
      `docker exec nodus_postgres psql -U ${user} -c "CREATE DATABASE nodus_night"`,
      {
        shell: true,
        stdio: 'inherit',
      },
    );
    if (created.status !== 0) process.exit(created.status ?? 1);
  }
  console.log('sandbox: миграции nodus_night (idempotent)...');
  run('pnpm --filter @nodus/api exec prisma migrate deploy', [], {
    ...process.env,
    DATABASE_URL: env.DATABASE_URL,
  });
  console.log('sandbox: night-пользователи для проб (idempotent)...');
  run('node scripts/night-users.mjs', [], { ...process.env, DATABASE_URL: env.DATABASE_URL });
}

async function up() {
  const existing = Object.entries(readPids()).filter(([, pid]) => pidAlive(pid));
  if (existing.length > 0) {
    console.error(
      `live-stack already running (${existing.map(([n, p]) => `${n}=${p}`).join(', ')}). Run first: pnpm live-stack down`,
    );
    process.exit(1);
  }
  for (const [name, port] of Object.entries(PORTS)) {
    if (await portBusy(port)) {
      console.error(
        `Port :${port} (${name}) is taken by a FOREIGN process (likely an orphan of a past session).\n` +
          `Find and kill it: netstat -ano | findstr :${port}  ->  taskkill /PID <pid> /F`,
      );
      process.exit(1);
    }
  }

  // Изоляция песочницы (#178, урок-инцидент #175): без явного env процесса
  // песочница САМА уходит на изолированные nodus_night + Redis db1 — из .env
  // (там прод-значения) конструируем песочные. Явный env процесса главнее;
  // осознанный прогон против прода — SANDBOX_ON_PROD=1 (не рекомендуется:
  // два outbox-диспетчера на одной БД воруют события, пробные данные — в прод).
  const dotenv = loadDotEnv();
  const base = { ...dotenv, ...process.env };
  const nightUrl = (url) => url.replace(/\/nodus(\?|$)/, '/nodus_night$1');
  if (!process.env.DATABASE_URL && base.DATABASE_URL) {
    const rewritten = nightUrl(base.DATABASE_URL);
    if (rewritten !== base.DATABASE_URL) {
      base.DATABASE_URL = rewritten;
      console.log(
        'sandbox: DATABASE_URL -> nodus_night (авто-изоляция; прод — только SANDBOX_ON_PROD=1)',
      );
    }
  }
  if (!process.env.REDIS_URL && base.REDIS_URL) {
    // Суффикс БД обязателен: без него redis-клиент сидит в db0 = ПРОД-редис —
    // два издателя одного стрима событий крадут fanout друг у друга.
    const rewritten = base.REDIS_URL.replace(/^(rediss?:\/\/[^/?#]*)(\/\d+)?([?#].*)?$/, '$1/1$3');
    if (rewritten !== base.REDIS_URL) {
      base.REDIS_URL = rewritten;
      console.log('sandbox: REDIS_URL -> db1 (авто-изоляция стрима/очередей от прода)');
    }
  }
  if (/\/nodus(\?|$)/.test(base.DATABASE_URL ?? '') && !process.env.SANDBOX_ON_PROD) {
    console.error(
      `DATABASE_URL указывает на прод-базу 'nodus' (${base.DATABASE_URL.replace(/\/\/[^@]*@/, '//***@')}).\n` +
        `Песочница live-stack работает на изолированной БД nodus_night (авто при запуске без env).\n` +
        `Осознанный запуск против прода (не рекомендуется): SANDBOX_ON_PROD=1.`,
    );
    process.exit(1);
  }
  bootstrapNight(base);

  console.log('Building api + gateway + web (non-mock)...');
  run('pnpm --filter @nodus/api build');
  run('pnpm --filter @nodus/gateway build');
  // Прямой vite build: non-mock явно (turbo-кэш тоже видит env — turbo.json —
  // но здесь не хотим пересобирать остальной граф).
  run('pnpm --filter @nodus/web exec vite build', [], { ...process.env, VITE_API_MOCK: 'false' });

  const pids = {
    api: startService('api', ['apps/api/dist/main.js'], {
      ...base,
      API_PORT: String(PORTS.api),
      NODE_ENV: 'development',
      COOKIE_SECURE: 'false',
      // e2e-прогоны подряд с двух браузеров выбивают дефолт 3000/мин с NAT-IP.
      RATE_LIMIT_MAX: '30000',
      // ONLYOFFICE (#138): documentserver-контейнер (compose profile office)
      // ходит за файлами/колбэками на ЭТОТ api — адрес хоста из контейнера.
      OFFICE_API_INTERNAL_URL: `http://host.docker.internal:${PORTS.api}`,
      // Gotenberg (#139, производные): api на хосте — loopback-порт compose.
      GOTENBERG_URL: 'http://127.0.0.1:3100',
    }),
    gateway: startService('gateway', ['apps/gateway/dist/main.js'], {
      ...base,
      GATEWAY_PORT: String(PORTS.gateway),
    }),
    web: startService(
      'web',
      [
        vitePreviewBin(),
        'preview',
        '--host',
        '127.0.0.1',
        '--port',
        String(PORTS.web),
        '--strictPort',
      ],
      {
        ...base,
        NODUS_API_DEV_TARGET: `http://127.0.0.1:${PORTS.api}`,
        NODUS_GATEWAY_DEV_TARGET: `http://127.0.0.1:${PORTS.gateway}`,
      },
      path.join(ROOT, 'apps/web'),
    ),
  };
  fs.writeFileSync(PID_FILE, JSON.stringify(pids, null, 2));

  console.log('Waiting for stack health...');
  await waitHealthy('api', HEALTH.api, 60_000);
  await waitHealthy('gateway', HEALTH.gateway, 30_000);
  await waitHealthy('web', HEALTH.web, 30_000);
  console.log(
    `Ready: web http://127.0.0.1:${PORTS.web} (api :${PORTS.api}, gateway :${PORTS.gateway}); logs in .live-stack/`,
  );
}

function killTree(pid) {
  if (process.platform === 'win32') {
    // Одной строкой: shell=true + массив аргументов = DeprecationWarning.
    spawnSync(`taskkill /PID ${pid} /T /F`, { shell: true });
  } else {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      /* уже ушёл */
    }
  }
}

function down() {
  let stopped = 0;
  for (const [name, pid] of Object.entries(readPids())) {
    if (pidAlive(pid)) {
      killTree(pid);
      console.log(`stopped ${name} (pid ${pid})`);
      stopped += 1;
    }
  }
  fs.rmSync(PID_FILE, { force: true });
  console.log(
    stopped === 0 ? 'Stack was not running (no/empty PID file).' : `Stopped processes: ${stopped}`,
  );
}

async function status() {
  const pids = readPids();
  for (const [name, port] of Object.entries(PORTS)) {
    const pid = pids[name];
    const busy = await portBusy(port);
    const state = pidAlive(pid)
      ? `running (pid ${pid})`
      : busy
        ? 'port taken by FOREIGN process (orphan?)'
        : 'free';
    console.log(`${name.padEnd(8)} :${port}  ${state}`);
  }
}

const command = process.argv[2];
try {
  if (command === 'up') await up();
  else if (command === 'down') down();
  else if (command === 'status') await status();
  else if (command === 'bootstrap') {
    // Ручной бутстрап изоляции (up делает это сам): env — как у up.
    const dotenv = loadDotEnv();
    const env = { ...dotenv, ...process.env };
    if (!process.env.DATABASE_URL && env.DATABASE_URL) {
      env.DATABASE_URL = env.DATABASE_URL.replace(/\/nodus(\?|$)/, '/nodus_night$1');
    }
    bootstrapNight(env);
  } else {
    console.error('Usage: pnpm live-stack <up|down|status|bootstrap>');
    process.exit(1);
  }
} catch (error) {
  console.error(`live-stack: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
