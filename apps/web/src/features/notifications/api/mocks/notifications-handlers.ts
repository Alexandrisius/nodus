import { HttpResponse, http } from 'msw';
import type { Notification } from '@nodus/contracts';

import { demoBackgroundBulk, demoNotifications } from './notification-mock-data.js';

/** Живое мок-состояние журнала (#100): прочтения/ack мутируют данные,
 *  актёр — из живого auth-стора (покомпонентный режим). */
const readIds = new Set<string>();
const acked = new Set<string>();

/**
 * Привязка демо-журнала к РЕАЛЬНЫМ беседам аккаунта (фидбек владельца
 * 01.10: клик по уведомлению должен открывать ИМЕННО тот чат). На деве
 * :5173 уведомления — мок, а чат живой; статические id бесед там не
 * существуют. Хендлеры однократно догружают список реальных бесед (тем же
 * авторизационным заголовком) и пересобирают демо-набор под них: direct
 * беседы получают kind'ы «личное/срочное» (+ имя собеседника из title),
 * группы/каналы — упоминания/фон с настоящими названиями. Недоступен чат
 * (например, он тоже на моках без бесед) — статический набор как раньше.
 */
interface RealConv {
  id: string;
  type: string;
  title: string | null;
}

let realConvsCache: RealConv[] | null | undefined;
let boundCache: Notification[] | undefined;
let boundBulkCache: Notification[] | undefined;

async function loadRealConversations(request: Request): Promise<RealConv[] | null> {
  if (realConvsCache !== undefined) return realConvsCache;
  try {
    const res = await fetch('/api/v1/chat/conversations?limit=50', {
      headers: { authorization: request.headers.get('authorization') ?? '' },
    });
    if (!res.ok) throw new Error(`chat ${res.status}`);
    const json = (await res.json()) as { items?: RealConv[] };
    realConvsCache = Array.isArray(json.items) && json.items.length > 0 ? json.items : null;
  } catch {
    realConvsCache = null;
  }
  return realConvsCache;
}

/** Перепривязка одной записи к реальной беседе (id/название/собеседник). */
function bindItem(n: Notification, conv: RealConv, direct: boolean): Notification {
  if (!direct) {
    return {
      ...n,
      conversationId: conv.id,
      conversationTitle: conv.title ?? n.conversationTitle,
      sourceId: conv.id,
    };
  }
  const who = conv.title;
  const actor =
    who === null
      ? n.actor
      : n.actor
        ? { ...n.actor, displayName: who }
        : { id: conv.id, displayName: who, avatarUrl: null };
  return {
    ...n,
    conversationId: conv.id,
    conversationTitle: null,
    sourceId: conv.id,
    actor,
  };
}

function bindToRealConversations(items: Notification[], convs: RealConv[]): Notification[] {
  const directs = convs.filter((c) => c.type === 'direct');
  const groups = convs.filter((c) => c.type !== 'direct');
  let d = 0;
  let g = 0;
  return items.map((n) => {
    if (!n.conversationId) return n;
    if (n.kind === 'urgent.message' || n.kind === 'chat.direct_message') {
      if (directs.length === 0) return n;
      const conv = directs[d % directs.length]!;
      d += 1;
      return bindItem(n, conv, true);
    }
    if (groups.length === 0) return n;
    const conv = groups[g % groups.length]!;
    g += 1;
    return bindItem(n, conv, false);
  });
}

/** Демо-набор, привязанный к реальным беседам (кэш на сессию). */
async function demoJournal(request: Request): Promise<{
  main: Notification[];
  bulk: Notification[];
}> {
  const convs = await loadRealConversations(request);
  if (convs === null) {
    return { main: demoNotifications, bulk: demoBackgroundBulk };
  }
  boundCache ??= bindToRealConversations(demoNotifications, convs);
  boundBulkCache ??= bindToRealConversations(demoBackgroundBulk, convs);
  return { main: boundCache, bulk: boundBulkCache };
}

function unreadOf(journal: { main: Notification[]; bulk: Notification[] }): Notification[] {
  return journal.main.filter((n) => !readIds.has(n.id));
}

export const notificationsHandlers = [
  http.get('/api/v1/notifications', async ({ request }) => {
    const url = new URL(request.url);
    const filter = url.searchParams.get('filter') ?? 'attention';
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    const journal = await demoJournal(request);
    let items: Notification[];
    switch (filter) {
      case 'all':
        // История журнала целиком (включая прочитанные) — источник данных
        // карточки просмотра: открытое уведомление ищется и после гашения.
        items = journal.main.concat(journal.bulk);
        break;
      default:
        items = unreadOf(journal);
        if (filter === 'attention') {
          items = items.filter((n) => n.tier !== 'background');
        } else if (filter === 'mentions') {
          items = items.filter((n) => n.kind === 'chat.mention');
        } else if (filter === 'actions') {
          items = items.filter((n) => n.tier === 'action');
        } else if (filter === 'background') {
          items = items
            .concat(journal.bulk)
            .filter((n) => n.tier === 'background' && !readIds.has(n.id));
        }
        break;
    }
    if (q.length > 0) {
      items = items.filter(
        (n) =>
          (n.preview ?? '').toLowerCase().includes(q) ||
          (n.actor?.displayName ?? '').toLowerCase().includes(q),
      );
    }
    const limit = Number(url.searchParams.get('limit') ?? 50);
    const page = items.slice(0, limit);
    return HttpResponse.json({
      items: page,
      nextCursor: items.length > limit ? String(items[limit - 1]!.seq) : null,
      lastSeq: page.length > 0 ? Math.max(...page.map((n) => n.seq)) : 0,
    });
  }),

  http.get('/api/v1/notifications/summary', async ({ request }) => {
    const items = unreadOf(await demoJournal(request));
    return HttpResponse.json({
      urgent: items.filter((n) => n.tier === 'urgent').length,
      personal: items.filter((n) => n.tier === 'personal').length,
      action: items.filter((n) => n.tier === 'action').length,
      background: items.filter((n) => n.tier === 'background').length + demoBackgroundBulk.length,
      attention: items.filter((n) => n.tier !== 'background').length,
    });
  }),

  http.get('/api/v1/notifications/settings', () =>
    HttpResponse.json({ dndEnabled: false, dndStart: '22:00', dndEnd: '08:00' }),
  ),

  http.patch('/api/v1/notifications/settings', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      dndEnabled: (body.dndEnabled as boolean) ?? false,
      dndStart: (body.dndStart as string) ?? '22:00',
      dndEnd: (body.dndEnd as string) ?? '08:00',
    });
  }),

  http.post('/api/v1/notifications/:id/read', async ({ params, request }) => {
    const id = params.id as string;
    const item = (await demoJournal(request)).main.find((n) => n.id === id);
    // Гашение = уход из непрочитанных фильтров (readIds), как реальный API:
    // раньше менялся только readAt — строка зависала в списке навсегда.
    if (item && item.tier !== 'urgent') {
      item.readAt = new Date().toISOString();
      readIds.add(id);
    }
    return HttpResponse.json(item ?? {});
  }),

  http.post('/api/v1/notifications/:id/ack', async ({ params, request }) => {
    const id = params.id as string;
    acked.add(id);
    const item = (await demoJournal(request)).main.find((n) => n.id === id);
    if (item) {
      item.ackAt = new Date().toISOString();
      readIds.add(id);
    }
    return HttpResponse.json(item ?? {});
  }),

  http.get('/api/v1/notifications/urgent/:messageId/acks', ({ params }) => {
    const messageId = params.messageId as string;
    const target = demoNotifications.find((n) => n.messageId === messageId && n.tier === 'urgent');
    if (!target) {
      return HttpResponse.json({
        messageId,
        ackedCount: 0,
        expectedCount: 0,
        items: [],
      });
    }
    const isAcked = acked.has(target.id);
    return HttpResponse.json({
      messageId,
      ackedCount: isAcked ? 1 : 0,
      expectedCount: 1,
      items: isAcked
        ? [{ user: target.actor!, ackedAt: target.ackAt ?? new Date().toISOString() }]
        : [],
    });
  }),

  http.get('/api/v1/notifications/:id/deliveries', ({ params }) => {
    const id = params.id as string;
    return HttpResponse.json({
      items: [
        { channel: 'ws', attempt: 0, deliveredAt: new Date().toISOString() },
        ...(acked.has(id)
          ? []
          : [{ channel: 'repeat', attempt: 1, deliveredAt: new Date().toISOString() }]),
      ],
    });
  }),
];
