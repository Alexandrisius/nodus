import type { Notification } from '@nodus/contracts';

import { cid, mid } from '../../../../shared/mocks/data/chat-ids.js';
import { userRef, userIds } from '../../../../shared/mocks/data/users.js';

/** Динамические даты (канон: никаких «сегодня» хардкодом — дата-бомбы). */
function minutesAgo(min: number): string {
  return new Date(Date.now() - min * 60_000).toISOString();
}

const URGENT_LONG_TEXT = [
  'Внимание! Завтра в 09:30 — выездная планёрка на объекте «Речпарт-Сити».',
  '',
  'Всем руководителям участков подтвердить присутствие до конца дня.',
  'На объекте предстоит приёмка блоков В-секции, поэтому форма одежды — строительная каска и жилет.',
  'С собой взять: удостоверения, планшет с чертежами марки КЖ, журнал производства работ.',
  '',
  'По итогам планёрки будет сформирован график устранения замечаний по итогам прошлого техосмотра.',
  'Ответственные по каждому замечанию будут закреплены протоколом.',
  'Отсутствие на планёрке без уважительной причины будет отмечено в протоколе.',
].join('\n');

const SEQ_SEAD = 100;
function notif(n: number, overrides: Partial<Notification>): Notification {
  return {
    id: `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    seq: SEQ_SEAD - n,
    priority: 'high',
    kind: 'chat.mention',
    sourceType: 'conversation',
    sourceId: cid(3),
    actor: userRef(userIds.shaiderova),
    preview: null,
    urgentText: null,
    conversationId: cid(3),
    conversationTitle: 'Отдел проектирования',
    messageId: mid(n),
    threadRootId: null,
    createdAt: minutesAgo(8 + n),
    readAt: null,
    ackAt: null,
    ...overrides,
  };
}

const SITE_CHAT = cid(5);
const DIRECT_K = cid(7);

/**
 * Демо-журнал уведомлений (#100/#189): полный срез приоритетов для приёмки —
 * срочные (одно длинное под гейт «долистал», одно короткое), личные
 * (несколько авторов/чатов, свежие и старые, пачка одного чата под
 * группировку «+N»), упоминания, средний приоритет (заделки), низкий
 * (посты каналов + правка сообщения), прочитанные + горка для «999+».
 */
export const demoNotifications: Notification[] = [
  // ===== Срочные =====
  notif(1, {
    priority: 'urgent',
    kind: 'urgent.message',
    preview: 'Внимание! Завтра в 09:30 — выездная планёрка…',
    urgentText: URGENT_LONG_TEXT,
    actor: userRef(userIds.klimovich),
    conversationTitle: null,
    sourceId: DIRECT_K,
    conversationId: DIRECT_K,
    createdAt: minutesAgo(4),
  }),
  notif(2, {
    priority: 'urgent',
    kind: 'urgent.message',
    preview: 'Срочно: подпишите акт КС-2 до 18:00',
    actor: userRef(userIds.shaiderova),
    conversationTitle: null,
    sourceId: DIRECT_K,
    conversationId: DIRECT_K,
    createdAt: minutesAgo(26),
  }),

  // ===== Личные: разные авторы и чаты =====
  notif(3, {
    priority: 'high',
    kind: 'chat.direct_message',
    preview: 'Отправил вам обновлённый сметный расчёт по этапу 3',
    actor: userRef(userIds.vinnichek),
    conversationTitle: null,
    sourceId: DIRECT_K,
    conversationId: DIRECT_K,
    createdAt: minutesAgo(12),
  }),
  notif(4, {
    priority: 'high',
    kind: 'chat.mention',
    preview: '@Александр, проверьте раздел АР-2 в чертежах',
    actor: userRef(userIds.shaiderova),
    createdAt: minutesAgo(19),
  }),
  notif(5, {
    priority: 'high',
    kind: 'chat.mention',
    preview: 'Прислал правки по фасаду — посмотри Layer 4',
    actor: userRef(userIds.shaiderova),
    createdAt: minutesAgo(95),
  }),
  notif(6, {
    priority: 'high',
    kind: 'chat.direct_message',
    preview: 'Кофе через 10 минут?',
    actor: userRef(userIds.polomar),
    conversationTitle: null,
    sourceId: cid(8),
    conversationId: cid(8),
    createdAt: minutesAgo(47),
  }),

  // Пачка одного чата — группировка «+2» (E4).
  notif(7, {
    priority: 'high',
    kind: 'chat.direct_message',
    preview: 'Схватка с заказчиком перенесена на четверг',
    actor: userRef(userIds.voronina),
    conversationTitle: null,
    sourceId: cid(9),
    conversationId: cid(9),
    createdAt: minutesAgo(70),
  }),
  notif(8, {
    priority: 'high',
    kind: 'chat.direct_message',
    preview: 'Отправил вам правки договора, п. 4.2',
    actor: userRef(userIds.voronina),
    sourceId: cid(9),
    conversationId: cid(9),
    createdAt: minutesAgo(73),
  }),

  // Ответ в треде (thread-follow).
  notif(9, {
    priority: 'high',
    kind: 'chat.thread_reply',
    preview: 'Ответ в обсуждении: деформационный шов',
    actor: userRef(userIds.vinnichek),
    threadRootId: mid(30),
    createdAt: minutesAgo(58),
  }),

  // ===== Действия (заделки H3) =====
  notif(10, {
    priority: 'medium',
    kind: 'action.assignment',
    preview: 'Поручение: согласовать спецификацию узла В-12',
    actor: userRef(userIds.shaiderova),
    sourceType: 'task',
    sourceId: 'd0000000-0000-4000-8000-000000000011',
    conversationId: null,
    conversationTitle: null,
    createdAt: minutesAgo(33),
  }),
  notif(11, {
    priority: 'medium',
    kind: 'action.approval',
    preview: 'Согласование: переработка от 27.09',
    actor: userRef(userIds.klimovich),
    sourceType: 'workflow',
    sourceId: 'd0000000-0000-4000-8000-000000000012',
    conversationId: null,
    conversationTitle: null,
    createdAt: minutesAgo(64),
  }),
  notif(12, {
    priority: 'medium',
    kind: 'action.deadline',
    preview: 'Срок: аудит безопасности — осталось 2 дня',
    actor: userRef(userIds.karpovich),
    sourceType: 'task',
    sourceId: 'd0000000-0000-4000-8000-000000000013',
    conversationId: null,
    conversationTitle: null,
    createdAt: minutesAgo(140),
  }),

  // ===== Фон: разные источники =====
  notif(13, {
    priority: 'low',
    kind: 'chat.channel_post',
    preview: 'Новая запись в канале «Новости компании»',
    actor: userRef(userIds.klimovich),
    sourceId: cid(2),
    conversationId: cid(2),
    conversationTitle: 'Новости компании',
    createdAt: minutesAgo(120),
  }),
  notif(14, {
    priority: 'low',
    kind: 'chat.channel_post',
    preview: 'Отчёт по итогам месяца опубликован',
    actor: userRef(userIds.shaiderova),
    sourceId: cid(2),
    conversationId: cid(2),
    conversationTitle: 'Новости компании',
    createdAt: minutesAgo(200),
  }),
  notif(15, {
    priority: 'low',
    kind: 'chat.channel_post',
    preview: 'На площадку завезли арматуру, фото в альбоме',
    actor: userRef(userIds.matorin),
    sourceId: SITE_CHAT,
    conversationId: SITE_CHAT,
    conversationTitle: 'Стройплощадка Речпарт',
    createdAt: minutesAgo(155),
  }),
  notif(19, {
    priority: 'low',
    kind: 'chat.message_edited',
    preview: 'Спецификация обновлена: добавлен узел В-12',
    actor: userRef(userIds.vinnichek),
    sourceId: SITE_CHAT,
    conversationId: SITE_CHAT,
    conversationTitle: 'Стройплощадка Речпарт',
    createdAt: minutesAgo(150),
  }),

  // ===== Прочитанные (фильтр «Все»; в секциях их нет) =====
  notif(16, {
    kind: 'chat.mention',
    preview: '@Александр, спасибо за консультацию',
    actor: userRef(userIds.akulich),
    createdAt: minutesAgo(400),
    readAt: minutesAgo(380),
  }),
  notif(17, {
    kind: 'chat.direct_message',
    preview: 'Отправил вам на проверку ведомость объёмов',
    actor: userRef(userIds.vinnichek),
    conversationTitle: null,
    sourceId: DIRECT_K,
    conversationId: DIRECT_K,
    createdAt: minutesAgo(520),
    readAt: minutesAgo(500),
  }),
  notif(18, {
    priority: 'medium',
    kind: 'action.assignment',
    preview: 'Поручение: проверить узлы примыкания (выполнено)',
    actor: userRef(userIds.klimovich),
    sourceType: 'task',
    sourceId: 'd0000000-0000-4000-8000-000000000014',
    conversationId: null,
    conversationTitle: null,
    createdAt: minutesAgo(700),
    readAt: minutesAgo(650),
  }),
];

/** Демо-горка низкого приоритета (E9 «999+»; в демо — умеренная пачка). */
export const demoBackgroundBulk: Notification[] = Array.from({ length: 25 }, (_, i) =>
  notif(100 + i, {
    priority: 'low',
    kind: 'chat.channel_post',
    preview: `Низкий приоритет #${i + 1}`,
    actor: userRef(userIds.klimovich),
    sourceId: cid(9),
    conversationId: cid(9),
    conversationTitle: 'Рабочие группы',
    createdAt: minutesAgo(400 + i),
  }),
);
