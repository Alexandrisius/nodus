/* global __ENV, __VU */
import ws from 'k6/ws';
import http from 'k6/http';
import { Counter, Trend, Gauge } from 'k6/metrics';

/**
 * Общий движок бота-сотрудника для k6-профилей #117: один WS-сеанс
 * (engine.io v4 фрейминг Socket.IO — auth в payload "40{...}", ping "2"/pong
 * "3"), подписка на свою команду и общий канал, пейсинг операций с джиттером
 * (отправка 55% / typing 15% / read-watermark 15% / реакция 10% / пауза 5%).
 *
 * Доставка собственного сообщения меряется до события на ЭТОМ же сокете —
 * путь api→outbox→Redis Stream→gateway→socket целиком (канон chat-ws-load.js).
 * Участник получает message_sent дважды (conv-комната + user-комната, роутинг
 * fanout.ts): первое совпадение закрывает ожидание, второе — просто events_rx.
 */

export const API = __ENV.API ?? 'http://host.docker.internal:3001';
export const GW = __ENV.GW ?? 'ws://host.docker.internal:3002';

export const metrics = {
  delivery: new Trend('chat_delivery_ms', true),
  connectMs: new Trend('ws_connect_ms', true),
  live: new Gauge('ws_live_sockets'),
  missed: new Counter('chat_missed_events'),
  sendFail: new Counter('chat_send_failures'),
  opFail: new Counter('chat_op_failures'),
  disconnects: new Counter('ws_disconnects'),
  eventsRx: new Counter('ws_events_rx'),
  typingRx: new Counter('ws_typing_rx'),
  connectErrors: new Counter('ws_connect_errors'),
  failedAttempts: new Counter('ws_failed_attempts'),
  reconnects: new Counter('ws_reconnects'),
};

const EMOJIS = ['👍', '🔥', '❤️', '🎯', '💪'];

function headers(bot) {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${bot.token}`,
    'Idempotency-Key': `k6-${bot.id.slice(0, 8)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
}

/**
 * Один сеанс бота. opts:
 *   sendEveryMs — период тика операций (джиттер ×0.75–1.25);
 *   mix — 'full' | 'msg' (только отправка);
 *   endTime — Date.now() окончания прогона;
 *   selfChurnProb — вероятность само-разрыва сокета на тике (churn-реализм);
 *   deliveryTimeoutMs — порог пропажи события (default 10s).
 * Возвращает 'done' | 'closed' | 'connect-failed'.
 */
export function botSession(bot, world, opts) {
  const url = `${GW}/socket.io/?EIO=4&transport=websocket`;
  const st = {
    connected: false,
    pending: {}, // messageId → момент начала запроса отправки
    rxTail: '', // хвост недавних событий (матчинг «событие раньше ответа»)
    seq: 0,
    lastSeq: {},
    seenMsg: null,
    closedByServer: false,
    joined: { 1: false, 2: false }, // ack-id → conv:join подтверждён
    liveCounted: false,
  };

  let res;
  try {
    res = ws.connect(url, {}, (socket) => {
      const startedAt = Date.now();

      socket.on('open', () => {
        socket.send(`40${JSON.stringify({ token: bot.token })}`);
      });

      socket.on('message', (msg) => {
        if (typeof msg !== 'string' || msg.length === 0) return;
        if (__ENV.RAW) console.log(`VU${__VU} rx ${msg.slice(0, 280)}`);
        if (msg === '2') {
          socket.send('3'); // engine.io keepalive
          return;
        }
        if (!msg.startsWith('4')) return;
        if (msg.startsWith('40') && !st.connected) {
          st.connected = true;
          metrics.connectMs.add(Date.now() - startedAt);
          metrics.live.add(1);
          st.liveCounted = true;
          // join с ack-запросом: операции начинаются только после подтверждения
          // членства (гонка «send до socket.join» даёт ложные пропуски).
          socket.send(`421["conv:join",{"conversationId":"${bot.teamId}"}]`);
          socket.send(`422["conv:join",{"conversationId":"${world.commonId}"}]`);
          return;
        }
        if (msg.startsWith('44')) {
          metrics.connectErrors.add(1);
          if (__ENV.DEBUG) console.log(`VU connect_error: ${msg.slice(0, 120)}`);
          socket.close();
          return;
        }
        const ackM = /^43(\d+)\[(.*)\]/.exec(msg);
        if (ackM) {
          st.joined[Number(ackM[1])] = ackM[2].includes('"ok":true');
          if (!ackM[2].includes('"ok":true')) metrics.opFail.add(1);
          return;
        }
        if (!msg.startsWith('42')) return;
        metrics.eventsRx.add(1);
        st.rxCount = (st.rxCount ?? 0) + 1;
        st.rxTail = `${st.rxTail ?? ''}\n${msg}`.slice(-16_000);
        if (msg.includes('"chat.typing"')) {
          metrics.typingRx.add(1);
          return;
        }
        // Доставка собственных сообщений: id → момент НАЧАЛА запроса отправки
        // (событие может прийти раньше HTTP-ответа — стрим-путь короче).
        for (const id of Object.keys(st.pending)) {
          if (msg.includes(id)) {
            metrics.delivery.add(Date.now() - st.pending[id]);
            delete st.pending[id];
          }
        }
        // Состояние для read-watermark и целей реакций
        const seqM = /"seq":(\d+)/.exec(msg);
        const convM = /"conversationId":"([0-9a-f-]{36})"/.exec(msg);
        if (seqM && convM) st.lastSeq[convM[1]] = Number(seqM[1]);
        if (convM && msg.includes('"chat.message_sent"')) {
          const idM = /"id":"([0-9a-f-]{36})"/.exec(msg);
          if (idM && !msg.includes(bot.id)) st.seenMsg = { id: idM[1], conv: convM[1] };
        }
      });

      socket.on('error', () => {
        if (!st.connected) metrics.failedAttempts.add(1);
      });
      socket.on('close', () => {
        if (st.liveCounted) {
          metrics.live.add(-1);
          st.liveCounted = false;
        }
        if (st.connected) {
          st.connected = false;
          st.closedByServer = true;
        }
        metrics.disconnects.add(1);
      });

      // Тик операций: джиттер периода рассинхронизирует VU (без синхроволн).
      const every = Math.round(opts.sendEveryMs * (0.75 + Math.random() * 0.5));
      socket.setInterval(() => {
        if (!st.connected || !st.joined[1] || !st.joined[2]) return;
        if (Date.now() >= opts.endTime) return;
        if (opts.selfChurnProb && Math.random() < opts.selfChurnProb) {
          socket.close(); // смоделированный уход пользователя/обрыв сети
          return;
        }
        const roll = Math.random();
        const target = Math.random() < 0.5 ? bot.teamId : world.commonId;
        if (opts.mix === 'msg' || roll < 0.55) {
          st.seq += 1;
          const startedAt = Date.now();
          const r = http.post(
            `${API}/api/v1/chat/conversations/${target}/messages`,
            JSON.stringify({ text: `k6 VU-${st.seq} ${Date.now()}` }),
            { headers: headers(bot), tags: { op: 'send' } },
          );
          if (r.status !== 201) {
            metrics.sendFail.add(1);
            if (Math.random() < 0.05)
              console.log(`send ${r.status}: ${String(r.body).slice(0, 80)}`);
          } else {
            const id = r.json('id');
            if ((st.rxTail ?? '').includes(id)) {
              // событие уже на сокете (пришло раньше ответа) — доставка мгновенная
              metrics.delivery.add(Date.now() - startedAt);
            } else {
              st.pending[id] = startedAt;
            }
          }
        } else if (roll < 0.7) {
          socket.send(`42["chat.typing",{"conversationId":"${target}"}]`);
        } else if (roll < 0.85) {
          const ids = Object.keys(st.lastSeq);
          if (ids.length > 0) {
            const conv = ids[ids.length - 1];
            const r = http.post(
              `${API}/api/v1/chat/conversations/${conv}/read`,
              JSON.stringify({ upToSeq: st.lastSeq[conv] }),
              { headers: headers(bot), tags: { op: 'read' } },
            );
            if (r.status >= 400) metrics.opFail.add(1);
          }
        } else if (roll < 0.95 && st.seenMsg) {
          const r = http.post(
            `${API}/api/v1/chat/conversations/${st.seenMsg.conv}/messages/${st.seenMsg.id}/reactions`,
            JSON.stringify({ emoji: EMOJIS[st.seq % EMOJIS.length] }),
            { headers: headers(bot), tags: { op: 'react' } },
          );
          if (r.status >= 400) metrics.opFail.add(1);
        }
        // roll >= 0.95 — «думает», без операции
      }, every);

      // Таймаут доставки: событие не вернулось на живой сокет за порог.
      socket.setInterval(() => {
        const limit = opts.deliveryTimeoutMs ?? 10_000;
        for (const id of Object.keys(st.pending)) {
          if (Date.now() - st.pending[id] > limit) {
            metrics.missed.add(1);
            if (__ENV.DEBUG) {
              console.log(
                `missed: VU=${__VU} msg=${id} age=${Date.now() - st.pending[id]}ms rx=${st.rxCount ?? 0}`,
              );
            }
            delete st.pending[id];
          }
        }
      }, 2000);

      socket.setTimeout(() => socket.close(), Math.max(1000, opts.endTime - Date.now()));
    });
  } catch {
    metrics.failedAttempts.add(1);
    return 'connect-failed';
  }

  if (res.status !== 101) {
    metrics.failedAttempts.add(1);
    return 'connect-failed';
  }
  return st.closedByServer ? 'closed' : 'done';
}
