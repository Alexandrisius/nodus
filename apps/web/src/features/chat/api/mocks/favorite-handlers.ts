import { HttpResponse, http } from 'msw';
import type { FavoriteCard } from '@nodus/contracts';

import { demoConversations, demoMessages } from '../../../../shared/mocks/data/chat.js';

/**
 * Моки избранного (#171, ревизия 04.10) — зеркалят живой API
 * (/chat/favorites): личные закладки в Map (labels — эмодзи-массив,
 * favoritedAt), карточки собираются из демо-данных (живая ссылка:
 * правка/удаление оригинала отражаются — тот же demoMessages-стор).
 * Гварды сервера отражены тоже: звезда только на сообщения существующих
 * бесед, «Избранное» (direct с собой) запрещено.
 */

interface FavoriteState {
  labels: string[];
  favoritedAt: string;
}

/** Личные закладки актёра: messageId → состояние. */
export const favoriteMocks = new Map<string, FavoriteState>();

function toCard(messageId: string): FavoriteCard | null {
  const message = demoMessages.find((m) => m.id === messageId);
  const state = favoriteMocks.get(messageId);
  // Призраки удалённых оригиналов не выдаются (#215, паритет серверному
  // фильтру списка + каскаду при удалении).
  if (!message || !state || message.deletedAt) return null;
  const conversation = demoConversations.find((c) => c.id === message.conversationId);
  const title =
    conversation?.title ??
    (conversation?.type === 'direct'
      ? (conversation.membersPreview[0]?.displayName ?? null)
      : null);
  const tombstone = message.deletedAt !== null;
  return {
    messageId,
    conversationId: message.conversationId,
    conversationTitle: title ?? null,
    conversationType: conversation?.type ?? 'group',
    threadRootId: message.threadRootId,
    author: message.author,
    text: tombstone ? '' : message.text,
    attachments: tombstone ? [] : message.attachments,
    editedAt: message.editedAt,
    deletedAt: message.deletedAt,
    // Флаги важного — из живого сообщения (паритет favorite-card.mapper, #177).
    urgent: message.urgent,
    requireAck: message.requireAck,
    obliterated: false,
    createdAt: message.createdAt,
    labels: state.labels,
    favoritedAt: state.favoritedAt,
  };
}

export const favoriteHandlers = [
  http.get('/api/v1/chat/favorites', ({ request }) => {
    const url = new URL(request.url);
    const conversationId = url.searchParams.get('conversationId');
    const label = url.searchParams.get('label');
    const q = url.searchParams.get('q')?.toLowerCase() ?? null;
    let cards = [...favoriteMocks.keys()].flatMap((id) => {
      const card = toCard(id);
      return card ? [card] : [];
    });
    if (conversationId) cards = cards.filter((c) => c.conversationId === conversationId);
    if (label) cards = cards.filter((c) => c.labels.includes(label));
    if (q) cards = cards.filter((c) => c.text.toLowerCase().includes(q));
    cards.sort((a, b) => (a.favoritedAt < b.favoritedAt ? 1 : -1));
    return HttpResponse.json({ items: cards, nextCursor: null });
  }),

  http.get('/api/v1/chat/favorites/labels', () => {
    const seen = new Set<string>();
    for (const card of [...favoriteMocks.keys()].flatMap((id) => {
      const c = toCard(id);
      return c ? [c] : [];
    })) {
      for (const label of card.labels) seen.add(label);
    }
    return HttpResponse.json({ items: [...seen] });
  }),

  http.post('/api/v1/chat/favorites', async ({ request }) => {
    const body = (await request.json()) as { messageIds: string[] };
    const base = Date.now();
    const items: FavoriteCard[] = [];
    body.messageIds.forEach((messageId, index) => {
      const message = demoMessages.find((m) => m.id === messageId);
      if (!message || favoriteMocks.has(messageId)) return;
      favoriteMocks.set(messageId, {
        labels: [],
        favoritedAt: new Date(base + index).toISOString(),
      });
      const card = toCard(messageId);
      if (card) items.push(card);
    });
    // Активность «Избранного» (#215, паритет серверному touchLastMessageAt +
    // lastActivityAt списка): новая звезда поднимает беседу «Избранное»
    // наверх — клиент сортирует по lastActivityAt.
    if (items.length > 0) {
      const notes = demoConversations.find(
        (c) => c.type === 'direct' && c.membersPreview.length === 1,
      );
      if (notes) {
        notes.lastActivityAt = new Date().toISOString();
        const index = demoConversations.indexOf(notes);
        if (index > 0) {
          demoConversations.splice(index, 1);
          demoConversations.unshift(notes);
        }
      }
    }
    return HttpResponse.json({ items });
  }),

  http.patch('/api/v1/chat/favorites/:messageId', async ({ params, request }) => {
    const messageId = String(params.messageId);
    const state = favoriteMocks.get(messageId);
    if (!state) {
      return HttpResponse.json(
        { code: 'NOT_FOUND', message: 'Favorite not found' },
        { status: 404 },
      );
    }
    const body = (await request.json()) as { labels?: string[] };
    if (body.labels !== undefined) state.labels = body.labels;
    const card = toCard(messageId);
    return card ? HttpResponse.json(card) : HttpResponse.json({}, { status: 404 });
  }),

  http.delete('/api/v1/chat/favorites/:messageId', ({ params }) => {
    favoriteMocks.delete(String(params.messageId));
    return new HttpResponse(null, { status: 204 });
  }),
];
