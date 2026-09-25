/* global __ENV, __VU, __ITER */
/**
 * k6-профиль нагрузки REST-чата «рабочий день чата» (issue #58, Ф5).
 *
 * Сценарий на каждый VU: список бесед → (первая итерация: создать свою группу
 * `load-vu${__VU}`) → лента (limit=50) → отправка сообщения → с вероятностью
 * 1/5 правка последнего своего → с вероятностью 1/5 реакция на него →
 * пауза 0.5–2 c. Каждая мутация — с уникальным `idempotency-key`.
 *
 * Пороги (НФТ): http_req_failed < 1%; p(95) < 200 мс и p(99) < 400 мс
 * в КАЖДОЙ группе эндпоинтов.
 *
 * Запуск (k6 в docker, хост-апи на :3012):
 *   docker run --rm -v "$PWD:/scripts" -e BASE_URL=http://host.docker.internal:3012 \
 *     grafana/k6:0.58.0 run --vus 25 --duration 10m /scripts/chat-load.js
 *
 * Результат: /scripts/result.json (handleSummary: per-group p50/p95/p99,
 * fail-rate, счётчики). GOTCHA (урок прогона #58): слой идемпотентности
 * (ADR-0005) кэширует POST-ответы на 24 ч — ключи `idempotency-key` в setup
 * обязаны быть уникальными на запуск (RUN_ID), иначе логин вернёт
 * закэшированный токен первого прогона (истёкший) → шторм 401.
 */
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://host.docker.internal:3012';

/** Сид-пользователи (пароли — env: сид больше не имеет известных дефолтов). */
const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD ?? '';
const DEMO_PASSWORD = __ENV.DEMO_PASSWORD ?? '';
const USERS = [
  { email: 'admin@nodus.by', password: ADMIN_PASSWORD },
  { email: 'klimovich@nodus.by', password: DEMO_PASSWORD },
  { email: 'vasilevich@nodus.by', password: DEMO_PASSWORD },
  { email: 'ivanov@nodus.by', password: DEMO_PASSWORD },
  { email: 'petrov@nodus.by', password: DEMO_PASSWORD },
  { email: 'sidorova@nodus.by', password: DEMO_PASSWORD },
];

/** Группы = тегированные подметрики: p50/p95/p99 и fail-rate по эндпоинту. */
const GROUPS = [
  'list_conversations',
  'open_feed',
  'send_message',
  'edit_message',
  'toggle_reaction',
];
const trend = {};
const failRate = {};
const count = {};
for (const g of GROUPS) {
  trend[g] = new Trend(`${g}_duration`, true);
  failRate[g] = new Rate(`${g}_fail`);
  count[g] = new Counter(`${g}_count`);
}
const createdConversations = new Counter('create_conversation_count');

export const options = {
  vus: 25,
  duration: '10m',
  summaryTrendStats: ['count', 'avg', 'min', 'med', 'max', 'p(50)', 'p(95)', 'p(99)'],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<200'],
    list_conversations_duration: ['p(95)<200', 'p(99)<400'],
    open_feed_duration: ['p(95)<200', 'p(99)<400'],
    send_message_duration: ['p(95)<200', 'p(99)<400'],
    edit_message_duration: ['p(95)<200', 'p(99)<400'],
    toggle_reaction_duration: ['p(95)<200', 'p(99)<400'],
  },
  discardResponseBodies: false,
};

/** Логин всех 6 пользователей; VU закрепляется за одним по (__VU-1) % 6.
 *  Idempotency-Key уникален НА ЗАПУСК (RUN_ID): слой идемпотентности (ADR-0005)
 *  кэширует POST-ответы на 24 ч — фиксированные ключи вернули бы токены
 *  первого прогона (истёкшие). */
const RUN_ID = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;

export function setup() {
  const tokens = USERS.map((user, i) => {
    const res = http.post(`${BASE_URL}/api/v1/auth/login`, JSON.stringify(user), {
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `setup-login-${RUN_ID}-${i}`,
      },
    });
    if (res.status !== 200) {
      throw new Error(`Логин ${user.email} не удался: ${res.status} ${res.body}`);
    }
    return res.json('accessToken');
  });
  return { tokens };
}

// Состояние VU (k6 даёт каждому VU свой рантайм-скоуп модуля): своя беседа и
// последнее отправленное сообщение (для правки/реакции).
const vuState = {};

export default function (data) {
  const vu = __VU;
  const iter = __ITER;
  const token = data.tokens[(vu - 1) % data.tokens.length];
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const mutateHeaders = (key) => ({
    ...headers,
    'idempotency-key': `${vu}-${iter}-${key}-${Date.now()}`,
  });

  // 1. Список бесед.
  group('list_conversations', () => {
    const res = http.get(`${BASE_URL}/api/v1/chat/conversations`, { headers });
    record('list_conversations', res, 200);
  });

  // 2. Первая итерация VU — создаёт свою группу, дальше только в неё пишет.
  if (!vuState[vu]) {
    const res = http.post(
      `${BASE_URL}/api/v1/chat/conversations`,
      JSON.stringify({ type: 'group', title: `load-vu${vu}` }),
      { headers: mutateHeaders('conv') },
    );
    const ok = check(res, { 'create conversation 201': (r) => r.status === 201 });
    if (!ok) {
      console.error(`VU${vu}: не удалось создать беседу: ${res.status} ${res.body}`);
      return; // итерация без беседы бессмысленна
    }
    vuState[vu] = { conversationId: res.json('id'), lastMessageId: null };
    createdConversations.add(1);
  }
  const conversationId = vuState[vu].conversationId;

  // 3. Лента беседы (последние 50 сообщений).
  group('open_feed', () => {
    const res = http.get(
      `${BASE_URL}/api/v1/chat/conversations/${conversationId}/messages?limit=50`,
      { headers },
    );
    record('open_feed', res, 200);
  });

  // 4. Отправка сообщения.
  group('send_message', () => {
    const res = http.post(
      `${BASE_URL}/api/v1/chat/conversations/${conversationId}/messages`,
      JSON.stringify({ text: `load msg vu${vu} iter${iter} ${Date.now()}` }),
      { headers: mutateHeaders('msg') },
    );
    record('send_message', res, 201);
    if (res.status === 201) vuState[vu].lastMessageId = res.json('id');
  });

  // 5. Правка последнего своего (вероятность 1/5).
  const lastMessageId = vuState[vu].lastMessageId;
  if (lastMessageId && Math.random() < 0.2) {
    group('edit_message', () => {
      const res = http.patch(
        `${BASE_URL}/api/v1/chat/conversations/${conversationId}/messages/${lastMessageId}`,
        JSON.stringify({ text: `edited vu${vu} iter${iter} ${Date.now()}` }),
        { headers: mutateHeaders('edit') },
      );
      record('edit_message', res, 200);
    });
  }

  // 6. Реакция на последнее своё (вероятность 1/5, toggle).
  if (lastMessageId && Math.random() < 0.2) {
    group('toggle_reaction', () => {
      const res = http.post(
        `${BASE_URL}/api/v1/chat/conversations/${conversationId}/messages/${lastMessageId}/reactions`,
        JSON.stringify({ emoji: '👍' }),
        { headers: mutateHeaders('react') },
      );
      record('toggle_reaction', res, 200);
    });
  }

  sleep(Math.random() * 1.5 + 0.5);
}

/** Фиксация результата запроса: trend + fail-rate + счётчик + check. */
function record(groupName, res, expectedStatus) {
  trend[groupName].add(res.timings.duration);
  failRate[groupName].add(res.status !== expectedStatus);
  count[groupName].add(1);
  const ok = check(res, { [`${groupName} ${expectedStatus}`]: (r) => r.status === expectedStatus });
  if (!ok) {
    console.error(
      `FAIL vu=${__VU} iter=${__ITER} ${groupName} status=${res.status} body=${String(res.body).slice(0, 140)}`,
    );
  }
}

/** Свой JSON-экспорт: per-group перцентили, которых нет в legacy --summary-export. */
export function handleSummary(data) {
  const metrics = {};
  for (const [name, metric] of Object.entries(data.metrics)) {
    metrics[name] = { type: metric.type, contains: metric.contains, values: metric.values };
    if (metric.thresholds) metrics[name].thresholds = metric.thresholds;
  }
  const sendRate = data.metrics.send_message_count.values.rate || 0;
  const lines = [
    '',
    '=== Nodus chat load — per-group summary ===',
    'group'.padEnd(22) +
      'count'.padStart(9) +
      'p50_ms'.padStart(9) +
      'p95_ms'.padStart(9) +
      'p99_ms'.padStart(9) +
      'fail_%'.padStart(8),
  ];
  for (const g of GROUPS) {
    const v = data.metrics[`${g}_duration`].values;
    const f = data.metrics[`${g}_fail`].values.rate;
    lines.push(
      g.padEnd(22) +
        String(Math.round(v.count)).padStart(9) +
        v['p(50)'].toFixed(1).padStart(9) +
        v['p(95)'].toFixed(1).padStart(9) +
        v['p(99)'].toFixed(1).padStart(9) +
        (f * 100).toFixed(2).padStart(8),
    );
  }
  const total = data.metrics.http_reqs.values;
  lines.push(
    `total http_reqs=${total.count}  rps=${total.rate.toFixed(2)}  send=${(sendRate * 60).toFixed(0)} msg/min`,
  );
  for (const [name, metric] of Object.entries(data.metrics)) {
    for (const [expr, result] of Object.entries(metric.thresholds ?? {})) {
      const ok = typeof result === 'object' && result !== null ? result.ok : Boolean(result);
      lines.push(`threshold ${name} ${expr}: ${ok ? 'OK' : 'FAIL'}`);
    }
  }
  console.log(lines.join('\n'));
  return {
    stdout: textSummaryShort(data),
    '/scripts/result.json': JSON.stringify({ metrics }, null, 2),
  };
}

/** Компактный текстовый итог (стандартный вывод отключён handleSummary). */
function textSummaryShort(data) {
  const failed = Object.entries(data.metrics)
    .filter(([, m]) =>
      Object.values(m.thresholds ?? {}).some((t) =>
        typeof t === 'object' && t !== null ? !t.ok : false,
      ),
    )
    .map(([name]) => name);
  const sendRate = data.metrics.send_message_count.values.rate || 0;
  return [
    '',
    `send=${(sendRate * 60).toFixed(0)} msg/min, http_reqs=${data.metrics.http_reqs.values.count}`,
    failed.length === 0 ? 'ALL THRESHOLDS PASSED' : `THRESHOLDS FAILED: ${failed.join(', ')}`,
    'result.json written to /scripts/result.json\n',
  ].join('\n');
}
