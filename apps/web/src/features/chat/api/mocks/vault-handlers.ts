import { HttpResponse, http } from 'msw';
import type {
  ConversationVaultPage,
  FavoriteSources,
  VaultItem,
  VaultLinkItem,
  VaultItemType,
} from '@nodus/contracts';

import { demoConversations, demoMessages } from '../../../../shared/mocks/data/chat.js';
import { getMockActor } from '../../../../shared/mocks/mock-actor.js';
import { favoriteMocks, toCard } from './favorite-handlers.js';

/**
 * Моки витрины беседы (#211) — зеркалят живой API: списки строятся по ВСЕМ
 * демо-сообщениям беседы (не «окну ленты»), счётчики — по тем же данным
 * (паритет денормализованным stats), ссылки — тем же алгоритмом, что
 * серверный экстрактор (https?:// + срез хвостовой пунктуации). Курсор —
 * opaque base64url {s: seq, o: position}, как cursor.util живого API.
 */

const URL_RE = /https?:\/\/\S+/g;
const TRAILING = '.,;:!?)]}\'">';

/** Эквивалент серверного extractMessageUrls (без капа — демо-объёмы). */
function extractUrls(text: string): string[] {
  const urls: string[] = [];
  for (const match of text.matchAll(URL_RE)) {
    let url = match[0];
    while (url.length > 0 && TRAILING.includes(url[url.length - 1]!)) url = url.slice(0, -1);
    if (url.length > 'https://'.length) urls.push(url);
  }
  return urls;
}

function encodeCursor(payload: { s: number; o: number }): string {
  return btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeCursor(raw: string | null): { s: number; o: number } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(atob(raw.replace(/-/g, '+').replace(/_/g, '/'))) as {
      s?: number;
      o?: number;
    };
    if (typeof parsed.s !== 'number' || typeof parsed.o !== 'number') return null;
    return { s: parsed.s, o: parsed.o };
  } catch {
    return null;
  }
}

/** Живые сообщения беседы в скоупе (вся беседа или тред с корнем, #42). */
function scopedMessages(conversationId: string, threadRootId: string | null) {
  return demoMessages
    .filter(
      (m) =>
        m.conversationId === conversationId &&
        !m.deletedAt &&
        (threadRootId === null || m.threadRootId === threadRootId || m.id === threadRootId),
    )
    .sort((a, b) => b.seq - a.seq);
}

function vaultCounts(conversationId: string, threadRootId: string | null) {
  const messages = scopedMessages(conversationId, threadRootId);
  return {
    media: messages.reduce(
      (sum, m) => sum + m.attachments.filter((a) => a.kind === 'image').length,
      0,
    ),
    document: messages.reduce(
      (sum, m) => sum + m.attachments.filter((a) => a.kind === 'file').length,
      0,
    ),
    link: messages.reduce((sum, m) => sum + extractUrls(m.text).length, 0),
  };
}

export const vaultHandlers = [
  http.get('/api/v1/chat/conversations/:id/attachments', ({ params, request }) => {
    const conversationId = String(params.id);
    if (!demoConversations.some((c) => c.id === conversationId)) {
      return HttpResponse.json(
        { code: 'NOT_FOUND', message: 'Conversation not found' },
        { status: 404 },
      );
    }
    const url = new URL(request.url);
    const type = (url.searchParams.get('type') ?? 'media') as VaultItemType;
    const threadRootId = url.searchParams.get('threadRootId');
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50) || 50, 100);
    const cursor = decodeCursor(url.searchParams.get('cursor'));
    const messages = scopedMessages(conversationId, threadRootId);
    const counts = vaultCounts(conversationId, threadRootId);

    const items: VaultItem[] = [];
    for (const message of messages) {
      if (type === 'link') {
        extractUrls(message.text).forEach((link, position) => {
          const after =
            !cursor || message.seq < cursor.s || (message.seq === cursor.s && position > cursor.o);
          if (!after) return;
          items.push({
            type: 'link',
            messageId: message.id,
            conversationId,
            threadRootId: message.threadRootId,
            author: message.author,
            createdAt: message.createdAt,
            url: link,
          } satisfies VaultLinkItem);
        });
      } else {
        message.attachments.forEach((attachment, order) => {
          if (attachment.kind !== (type === 'media' ? 'image' : 'file')) return;
          const after =
            !cursor || message.seq < cursor.s || (message.seq === cursor.s && order > cursor.o);
          if (!after) return;
          items.push({
            type: type === 'media' ? 'media' : 'document',
            messageId: message.id,
            conversationId,
            threadRootId: message.threadRootId,
            author: message.author,
            createdAt: message.createdAt,
            attachment,
          } satisfies VaultItem);
        });
      }
    }
    const page = items.slice(0, limit);
    const last = page[page.length - 1];
    const nextPage = items.length > limit && last ? last : null;
    const response: ConversationVaultPage = {
      items: page,
      nextCursor: nextPage ? encodeCursor({ s: seqOf(nextPage), o: orderOf(nextPage) }) : null,
      counts,
    };
    return HttpResponse.json(response);
  }),

  http.get('/api/v1/chat/favorites/sources', () => {
    const actor = getMockActor();
    const cards = [...favoriteMocks.keys()].flatMap((id) => {
      const card = toCard(id);
      return card ? [card] : [];
    });

    const byConversation = new Map<string, { count: number; last: string }>();
    for (const card of cards) {
      const entry = byConversation.get(card.conversationId) ?? { count: 0, last: card.favoritedAt };
      entry.count += 1;
      if (card.favoritedAt > entry.last) entry.last = card.favoritedAt;
      byConversation.set(card.conversationId, entry);
    }
    const sources = [...byConversation.entries()]
      .map(([conversationId, { count, last }]) => {
        const conversation = demoConversations.find((c) => c.id === conversationId);
        return {
          conversationId,
          title:
            conversation?.title ??
            (conversation?.type === 'direct'
              ? (conversation.membersPreview[0]?.displayName ?? null)
              : null),
          conversationType: conversation?.type ?? 'group',
          lastFavoritedAt: last,
          count,
        };
      })
      .sort((a, b) => (a.lastFavoritedAt < b.lastFavoritedAt ? 1 : -1));

    // «Записи»: свои живые сообщения беседы «Избранное».
    const notesConversation = demoConversations.find(
      (c) => c.type === 'direct' && c.membersPreview.length === 1,
    );
    const notesMessages = notesConversation
      ? demoMessages.filter(
          (m) =>
            m.conversationId === notesConversation.id && !m.deletedAt && m.author.id === actor.id,
        )
      : [];

    const response: FavoriteSources = {
      notes: {
        count: notesMessages.length,
        lastAt: notesMessages.reduce<string | null>(
          (last, m) => (last === null || m.createdAt > last ? m.createdAt : last),
          null,
        ),
      },
      sources,
      counts: {
        media: cards.reduce(
          (sum, c) => sum + c.attachments.filter((a) => a.kind === 'image').length,
          0,
        ),
        document: cards.reduce(
          (sum, c) => sum + c.attachments.filter((a) => a.kind === 'file').length,
          0,
        ),
        link: cards.reduce((sum, c) => sum + extractUrls(c.text).length, 0),
      },
    };
    return HttpResponse.json(response);
  }),
];

/** seq сообщения-источника элемента (демо-лента хранит seq в общем сторе). */
function seqOf(item: VaultItem): number {
  const message = demoMessages.find((m) => m.id === item.messageId);
  return message?.seq ?? 0;
}

/** Порядок внутри сообщения: индекс вложения/позиция ссылки. */
function orderOf(item: VaultItem): number {
  const message = demoMessages.find((m) => m.id === item.messageId);
  if (!message) return 0;
  if (item.type === 'link') return extractUrls(message.text).indexOf(item.url);
  return message.attachments.findIndex((a) => a.id === item.attachment.id);
}
