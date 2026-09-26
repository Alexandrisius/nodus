/* global __ENV, __VU, open */
import { sleep } from 'k6';
import { SharedArray } from 'k6/data';

import { botSession, metrics } from './lib/bot-engine.js';

/**
 * Часовой профиль НФТ (#117, обязательный перед пилотом): 300 WS-соединений,
 * 500 сообщений/мин, p95 доставки < 200 мс, ≥ 1 час + живучесть:
 * - саморазрывы сокетов (selfChurnProb) — реальные обрывы/переходы;
 * - ВНЕШНИЙ массовый реконнект: рестарт nodus_gateway на ~30-й минуте
 *   (docker restart из tools/run-soak.sh) — все 300 сокетов должны
 *   переподключиться и вернуться в строй без потерь отправок.
 * Порог: отправки без ошибок; пропуски допустимы ТОЛЬКО в окне рестарта
 * (события даунтайма клиент в проде добирает рефечем после reconnect).
 */

const DURATION_MS = Number(__ENV.DURATION_MS ?? 61 * 60_000);
const SEND_EVERY_MS = Number(__ENV.SEND_EVERY_MS ?? 20_000); // 300 VU × 55% тиков ≈ 500 сообщ/мин

const world = new SharedArray('world', () => [JSON.parse(open('./run/world.json'))]);

export const options = {
  scenarios: {
    soak: {
      executor: 'per-vu-iterations',
      vus: Number(__ENV.VUS ?? 300),
      iterations: 1,
      maxDuration: `${Math.ceil((DURATION_MS + 300_000) / 1000)}s`,
      gracefulStop: '30s',
    },
  },
  thresholds: {
    chat_delivery_ms: ['p(95)<200'],
    chat_send_failures: ['count==0'],
    ws_connect_errors: ['count==0'],
    // Потери доставки — только окно рестарта gateway (~1 событие на VU),
    // не систематические: порог с запасом, разбор ручной по timeline.
    chat_missed_events: ['count<300'],
  },
};

export default function () {
  const w = world[0];
  const bot = w.bots[(__VU - 1) % w.bots.length];
  const endAt = Date.now() + DURATION_MS;
  while (Date.now() < endAt) {
    botSession(bot, w, {
      sendEveryMs: SEND_EVERY_MS,
      mix: __ENV.MIX ?? 'full',
      endTime: endAt,
      selfChurnProb: 0.003, // ~раз в 5–6 мин сокет рвётся сам
      deliveryTimeoutMs: 15_000,
    });
    if (Date.now() < endAt) {
      metrics.reconnects.add(1);
      sleep(0.5 + Math.random() * 2); // бэкофф-разброс реконнекта, как socket.io-client
    }
  }
}
