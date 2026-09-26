/* global __ENV, __VU */
import ws from 'k6/ws';
import http from 'k6/http';
import { Counter, Trend } from 'k6/metrics';

/**
 * Нагрузка WS-доставки чата (#104, НФТ): 50 соединений держат сокеты,
 * каждое VU отправляет сообщение через HTTP api раз в 6 с (50 × 10/мин =
 * 500 сообщ/мин) и меряет задержку до возврата события chat.message_sent
 * на СОБСТВЕННЫЙ сокет (отправитель — член комнаты: RTT покрывает весь
 * путь api → outbox → Redis Stream → gateway → сокет). Порог p95 < 200 мс.
 *
 * k6/ws говорит с Socket.IO напрямую (engine.io v4): auth — payload
 * CONNECT-пакета "40{...}" (спайк ws-spike.js), ping/pong — фреймы "2"/"3".
 *
 * Запуск: MSYS_NO_PATHCONV=1 docker run --rm -v <repo>/apps/gateway/perf:/perf:ro \
 *   -e API=http://host.docker.internal:3011 -e GW=ws://host.docker.internal:3012 \
 *   -e DURATION=10m grafana/k6:0.58.0 run /perf/chat-ws-load.js
 * Беседа прогона (k6-ws-load-*) вычищается psql после запуска.
 */

const API = __ENV.API ?? 'http://host.docker.internal:3011';
const GW = __ENV.GW ?? 'ws://host.docker.internal:3012';
const DURATION_MS = Number(__ENV.DURATION_MS ?? 10 * 60 * 1000);

const delivery = new Trend('chat_delivery_ms', true);
const missed = new Counter('chat_missed_events');
const sendFailures = new Counter('chat_send_failures');

export const options = {
  scenarios: {
    ws_hold: {
      executor: 'per-vu-iterations',
      vus: Number(__ENV.VUS ?? 50),
      iterations: 1,
      maxDuration: __ENV.MAX_DURATION ?? '11m',
    },
  },
  thresholds: {
    chat_delivery_ms: ['p(95)<200'],
    chat_missed_events: ['count==0'],
    chat_send_failures: ['count==0'],
  },
};

export function setup() {
  const login = http.post(
    `${API}/api/v1/auth/login`,
    JSON.stringify({
      email: __ENV.EMAIL ?? 'admin@nodus.by',
      password: __ENV.PASSWORD ?? '',
    }),
    {
      headers: {
        'content-type': 'application/json',
        'Idempotency-Key': `k6-load-login-${Date.now()}`,
      },
    },
  );
  if (login.status !== 200) throw new Error(`login failed: ${login.status} ${login.body}`);
  const token = login.json('accessToken');
  const conv = http.post(
    `${API}/api/v1/chat/conversations`,
    JSON.stringify({
      type: 'group',
      title: `k6-ws-load-${Date.now()}`,
      memberIds: [],
    }),
    {
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        'Idempotency-Key': `k6-load-conv-${Date.now()}`,
      },
    },
  );
  if (conv.status !== 201) throw new Error(`conv failed: ${conv.status} ${conv.body}`);
  console.log('load conversation:', conv.json('id'));
  return { token: token, convId: conv.json('id') };
}

export default function (data) {
  const url = `${GW}/socket.io/?EIO=4&transport=websocket`;
  const state = { connected: false, joined: false, messageId: null, sentAt: 0, got: true, seq: 0 };

  const res = ws.connect(url, {}, (socket) => {
    socket.on('open', () => {
      socket.send(`40${JSON.stringify({ token: data.token })}`);
    });
    socket.on('message', (msg) => {
      if (typeof msg !== 'string' || msg.length === 0) return;
      // engine.io: сервер пингует "2" — обязаны отвечать "3" (иначе разрыв
      // по pingTimeout; браузерный клиент делает это сам).
      if (msg === '2') {
        socket.send('3');
        return;
      }
      if (!msg.startsWith('4')) return;
      if (msg.startsWith('40') && !state.connected) {
        state.connected = true;
        socket.send(`42["conv:join",{"conversationId":"${data.convId}"}]`);
        return;
      }
      if (msg.startsWith('42') && state.messageId && msg.includes(state.messageId)) {
        delivery.add(Date.now() - state.sentAt);
        state.got = true;
      }
    });
    socket.on('error', () => {
      if (!state.got) missed.add(1);
    });

    // Пейсинг: каждые 6 с одна отправка на VU (50 VU ≈ 500 сообщ/мин).
    socket.setInterval(() => {
      if (!state.connected || !state.got) return; // ждём коннекта/прошлое событие
      state.seq += 1;
      const send = http.post(
        `${API}/api/v1/chat/conversations/${data.convId}/messages`,
        JSON.stringify({ text: `k6-load-${__VU}-${state.seq}` }),
        {
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${data.token}`,
            'Idempotency-Key': `k6-load-${__VU}-${state.seq}-${data.convId}`,
          },
          tags: { name: 'send_message' },
        },
      );
      if (send.status !== 201) {
        sendFailures.add(1);
        console.log(`VU ${__VU}: send failed ${send.status}`);
        return;
      }
      state.messageId = send.json('id');
      state.sentAt = Date.now();
      state.got = false;
    }, 6000);

    socket.setTimeout(() => {
      if (!state.got) missed.add(1);
      socket.close();
    }, DURATION_MS - 2000);
  });

  if (res.status !== 101) throw new Error(`ws connect failed: ${res.status}`);
}

export function teardown(data) {
  console.log('teardown: psql-cleanup conversation', data.convId);
}
