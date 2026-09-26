/* global __ENV, open */
import http from 'k6/http';
import { SharedArray } from 'k6/data';
import { Counter, Trend } from 'k6/metrics';

/**
 * Логин-буря #117: утренний вход офиса — честный argon2-логин ботов (hash
 * наследован у админа) с постоянной интенсивностью. Отдельно от WS-стресса:
 * argon2 дорог НАМЕРЕННО, его потолок — самостоятельный предел системы.
 */

const API = __ENV.API ?? 'http://host.docker.internal:3001';

const loginMs = new Trend('auth_login_ms', true);
const failures = new Counter('auth_login_failures');

const world = new SharedArray('world', () => [JSON.parse(open('./run/world.json'))]);

export const options = {
  scenarios: {
    login: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.RATE ?? 30), // логинов/сек
      timeUnit: '1s',
      duration: __ENV.DURATION ?? '60s',
      preAllocatedVUs: Number(__ENV.PRE_VUS ?? 50),
      maxVUs: Number(__ENV.MAX_VUS ?? 300),
    },
  },
};

export default function () {
  const w = world[0];
  const bot = w.bots[Math.floor(Math.random() * w.bots.length)];
  const res = http.post(
    `${API}/api/v1/auth/login`,
    JSON.stringify({ email: bot.email, password: __ENV.PASSWORD ?? '' }),
    {
      headers: {
        'content-type': 'application/json',
        'Idempotency-Key': `k6-login-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      },
      tags: { op: 'login' },
    },
  );
  if (res.status === 200) {
    loginMs.add(res.timings.duration);
  } else {
    failures.add(1);
    if (Math.random() < 0.1) console.log(`login ${res.status}: ${String(res.body).slice(0, 100)}`);
  }
}
