/* global __ENV, __VU */
import ws from 'k6/ws';
import http from 'k6/http';
import { sleep } from 'k6';

/**
 * Спайк #104: k6/ws (raw WebSocket) против Socket.IO сервера напрямую —
 * engine.io v4 фрейминг:
 *   - auth в query-параметре `auth` (JSON) — как socket.io-client на
 *     websocket-транспорте (без polling-хендшейка);
 *   - "0{...}" OPEN → отправить "40" (namespace connect) → "40{sid}";
 *   - события: фреймы "42[event,payload]"; ack: "42<id>[event,...]".
 * Успех = сообщение, отправленное через HTTP api, возвращается событием
 * chat.message_sent на этот же сокет (отправитель — член комнаты).
 *
 * Запуск: MSYS_NO_PATHCONV=1 docker run --rm -v <repo>/apps/gateway/perf:/perf:ro \
 *   -e API=http://host.docker.internal:3011 -e GW=ws://host.docker.internal:3012 \
 *   grafana/k6:0.58.0 run /perf/ws-spike.js
 */

const API = __ENV.API ?? 'http://host.docker.internal:3011';
const GW = __ENV.GW ?? 'ws://host.docker.internal:3012';

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
        'Idempotency-Key': `spike-login-${Date.now()}`,
      },
    },
  );
  if (login.status !== 200) throw new Error(`login failed: ${login.status} ${login.body}`);
  const token = login.json('accessToken');
  const conv = http.post(
    `${API}/api/v1/chat/conversations`,
    JSON.stringify({ type: 'group', title: `k6-spike-${Date.now()}`, memberIds: [] }),
    {
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        'Idempotency-Key': `spike-conv-${Date.now()}`,
      },
    },
  );
  if (conv.status !== 201) throw new Error(`conv failed: ${conv.status} ${conv.body}`);
  console.log('setup conversation:', conv.json('id'));
  return { token: token, convId: conv.json('id') };
}

export default function (data) {
  const url = `${GW}/socket.io/?EIO=4&transport=websocket&auth=${encodeURIComponent(
    JSON.stringify({ token: data.token }),
  )}`;

  const state = { connected: false, sentAt: 0, messageId: null, got: false };

  const res = ws.connect(url, {}, (socket) => {
    socket.on('open', () => {
      console.log('[ws] open');
      // CONNECT-пакет namespace '/' несёт auth своим payload (socket.io
      // protocol v5): "40" + JSON(auth) — на websocket-транспорте только так.
      socket.send(`40${JSON.stringify({ token: data.token })}`);
    });
    socket.on('error', (e) => console.log('[ws] error', JSON.stringify(e)));

    socket.on('message', (msg) => {
      if (typeof msg !== 'string' || !msg.startsWith('4')) return;
      if (msg.startsWith('40') && !state.connected) {
        state.connected = true; // namespace connect ack
        console.log('[ws] namespace connected');
        return;
      }
      if (msg.startsWith('44')) {
        console.log('[ws] namespace connect_error:', msg.slice(0, 120));
        socket.close();
        return;
      }
      if (msg.startsWith('42') && state.messageId && msg.includes(state.messageId)) {
        state.got = true;
        console.log(`[ws] EVENT chat.message_sent latency=${Date.now() - state.sentAt} ms`);
        socket.close();
      }
    });

    // Стейджи: подключение namespace → join → отправка HTTP → таймаут.
    socket.setTimeout(() => {
      if (!state.connected) {
        console.log('[ws] namespace NOT connected after stage 1 — framing failed');
        socket.close();
        return;
      }
      socket.send(`42["conv:join",{"conversationId":"${data.convId}"}]`);
    }, 100);

    socket.setTimeout(() => {
      const send = http.post(
        `${API}/api/v1/chat/conversations/${data.convId}/messages`,
        JSON.stringify({ text: `k6-spike-message-${Date.now()}` }),
        {
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${data.token}`,
            'Idempotency-Key': `spike-msg-${Date.now()}-${__VU}`,
          },
        },
      );
      if (send.status !== 201) {
        console.log(`[ws] send failed: ${send.status} ${send.body.slice(0, 120)}`);
        socket.close();
        return;
      }
      state.messageId = send.json('id');
      state.sentAt = Date.now();
      console.log('[ws] message sent', state.messageId);
    }, 500);

    socket.setTimeout(() => {
      if (!state.got) console.log('[ws] TIMEOUT waiting for event');
      socket.close();
    }, 8000);
  });

  if (res.status !== 101) throw new Error(`ws connect failed: ${res.status}`);
  sleep(0.1);
}

export function teardown(data) {
  // Беседу спайка вычищает прогоняющий (psql) — endpoint-а удаления нет.
  console.log('teardown: cleanup conv', data.convId, 'via psql');
}
