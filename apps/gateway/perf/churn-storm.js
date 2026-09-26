/* global __ENV, __VU, open */
import { sleep } from 'k6';
import ws from 'k6/ws';
import { SharedArray } from 'k6/data';
import { Counter, Trend, Gauge } from 'k6/metrics';

/**
 * Churn-шторм #117: волны массовых подключений/отключений — модель утреннего
 * входа офиса и реконнекта после сбоя. Каждая VU: connect → hold → close →
 * пауза, CYCLES волн. Прогоняет самые хрупкие пути gateway: presence.snapshot
 * (каждому новичку — весь список онлайн) и presence.updated broadcast.
 */

const GW = __ENV.GW ?? 'ws://host.docker.internal:3002';
const HOLD_MS = Number(__ENV.HOLD_MS ?? 6000);
const GAP_MS = Number(__ENV.GAP_MS ?? 4000);
const CYCLES = Number(__ENV.CYCLES ?? 6);

const connectMs = new Trend('churn_connect_ms', true);
const snapshotBytes = new Trend('churn_presence_snapshot_bytes', true);
const snapshotEntries = new Gauge('churn_presence_entries');
const connErrors = new Counter('churn_connect_errors');
const live = new Gauge('churn_live_sockets');

const world = new SharedArray('world', () => [JSON.parse(open('./run/world.json'))]);

export const options = {
  scenarios: {
    churn: {
      executor: 'per-vu-iterations',
      vus: Number(__ENV.VUS ?? 300),
      iterations: CYCLES,
      maxDuration: `${Math.ceil(((HOLD_MS + GAP_MS) * CYCLES + 120_000) / 1000)}s`,
      gracefulStop: '10s',
    },
  },
};

export default function () {
  const bot = world[0].bots[(__VU - 1) % world[0].bots.length];
  const startedAt = Date.now();
  try {
    const res = ws.connect(`${GW}/socket.io/?EIO=4&transport=websocket`, {}, (socket) => {
      let connected = false;
      socket.on('open', () => socket.send(`40${JSON.stringify({ token: bot.token })}`));
      socket.on('message', (msg) => {
        if (typeof msg !== 'string' || msg.length === 0) return;
        if (msg === '2') {
          socket.send('3');
          return;
        }
        if (msg.startsWith('44')) {
          connErrors.add(1);
          socket.close();
          return;
        }
        if (msg.startsWith('40') && !connected) {
          connected = true;
          connectMs.add(Date.now() - startedAt);
          live.add(1);
          socket.send(`42["conv:join",{"conversationId":"${bot.teamId}"}]`);
          return;
        }
        if (msg.startsWith('42') && msg.includes('"presence.snapshot"')) {
          snapshotBytes.add(msg.length);
          const entries = (msg.match(/"status"/g) ?? []).length;
          if (entries > 0) snapshotEntries.add(entries);
        }
      });
      socket.on('close', () => {
        if (connected) live.add(-1);
      });
      socket.setTimeout(() => socket.close(), HOLD_MS);
    });
    if (res.status !== 101) connErrors.add(1);
  } catch {
    connErrors.add(1);
  }
  sleep(GAP_MS / 1000);
}
