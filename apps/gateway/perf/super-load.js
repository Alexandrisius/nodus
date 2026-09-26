/* global __ENV, __VU, open */
import { SharedArray } from 'k6/data';

import { botSession } from './lib/bot-engine.js';

/**
 * Стресс-лестница «предел прочности» #117: каждая ступень — отдельный запуск
 * k6 с ростом VUS (сокетов); темп на юзера постоянен (SEND_EVERY_MS), общая
 * нагрузка растёт с сокетами. VU N берёт бота bots[(N-1) % bots.length] —
 * свыше числа ботов пользователь получает «вкладки».
 * Порогов НЕТ: профиль ищет разлом (пороги — в hour-soak, канон НФТ).
 *
 * Запуск (из apps/gateway/perf, см. tools/run-ladder.sh):
 *   MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd):/perf:ro" -w /perf \
 *     -e API=http://host.docker.internal:3001 -e GW=ws://host.docker.internal:3002 \
 *     -e VUS=300 -e SEND_EVERY_MS=20000 -e DURATION_MS=180000 \
 *     grafana/k6:0.58.0 run super-load.js
 */

const DURATION_MS = Number(__ENV.DURATION_MS ?? 180_000);
const VUS = Number(__ENV.VUS ?? 50);
const SEND_EVERY_MS = Number(__ENV.SEND_EVERY_MS ?? 20_000);

const world = new SharedArray('world', () => [JSON.parse(open('./run/world.json'))]);

export const options = {
  scenarios: {
    ws_hold: {
      executor: 'per-vu-iterations',
      vus: VUS,
      iterations: 1,
      maxDuration: `${Math.ceil((DURATION_MS + 120_000) / 1000)}s`,
      gracefulStop: '10s',
    },
  },
};

export function setup() {
  const rate = Math.round((VUS / SEND_EVERY_MS) * 60_000 * 0.55);
  console.log(
    `super-load: VUS=${VUS} sendEvery=${SEND_EVERY_MS}ms (~${rate} сообщ/мин) ` +
      `mix=${__ENV.MIX ?? 'full'} duration=${DURATION_MS}ms bots=${world[0].bots.length}`,
  );
  return {};
}

export default function () {
  const w = world[0];
  const bot = w.bots[(__VU - 1) % w.bots.length];
  const result = botSession(bot, w, {
    sendEveryMs: SEND_EVERY_MS,
    mix: __ENV.MIX ?? 'full',
    endTime: Date.now() + DURATION_MS,
    deliveryTimeoutMs: Number(__ENV.DELIVERY_TIMEOUT_MS ?? 10_000),
  });
  if (result === 'connect-failed') console.log(`VU ${__VU}: connect failed`);
}
