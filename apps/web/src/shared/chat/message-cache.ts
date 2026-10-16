import type { ChatMessage, Paginated } from '@nodus/contracts';
import type { QueryClient } from '@tanstack/react-query';

import { chatKeys } from './chat-keys.js';

/**
 * Мутации сообщений линии A (#87): правка, удаление (одиночное/пакетное),
 * закрепы, пересылка. Единый оптимистичный паттерн (I4, patterns.md):
 * cancelQueries → снапшот → setQueriesData; откат по снапшоту; серверная
 * версия — истина в последней инстанции (onSuccess заменяет прогноз).
 * Ключ messages(conversationId) префиксом покрывает и тред-кеши —
 * одна трансформация правит ленту и окно треда одновременно.
 *
 * Этот файл — общий cache-patch мутаций сообщений; сами мутации — по группам:
 * edit-message-mutation.ts, delete-message-mutations.ts, pin-mutations.ts,
 * reaction-mutations.ts, forward-mutation.ts.
 */

export function mapMessage(
  qc: QueryClient,
  conversationId: string,
  messageId: string,
  fn: (message: ChatMessage) => ChatMessage | null,
): void {
  qc.setQueriesData<Paginated<ChatMessage>>(
    { queryKey: chatKeys.messages(conversationId) },
    (old) => {
      if (!old) return old;
      let touched = false;
      const items = old.items.flatMap((m) => {
        if (m.id !== messageId) return [m];
        touched = true;
        const next = fn(m);
        return next ? [next] : [];
      });
      return touched ? { ...old, items } : old;
    },
  );
}

/** Серверная истина после оптимистичного прогноза: заменить запись, а если
 *  её уже убрали из кэша (прогноз «без следа» разошёлся с сервером) — вернуть
 *  в конец ленты (позиция утрачена; рассинхрон досоздаст invalidate). */
export function upsertMessage(qc: QueryClient, conversationId: string, message: ChatMessage): void {
  let found = false;
  qc.setQueriesData<Paginated<ChatMessage>>(
    { queryKey: chatKeys.messages(conversationId) },
    (old) => {
      if (!old) return old;
      let touched = false;
      const items = old.items.map((m) => {
        if (m.id !== message.id) return m;
        touched = true;
        return message;
      });
      if (touched) found = true;
      return touched ? { ...old, items } : old;
    },
  );
  if (!found) {
    qc.setQueryData<Paginated<ChatMessage>>(chatKeys.messages(conversationId), (old) =>
      old ? { ...old, items: [...old.items, message] } : { items: [message], nextCursor: null },
    );
  }
}

export function findCached(
  qc: QueryClient,
  conversationId: string,
  messageId: string,
): ChatMessage | undefined {
  const caches = qc.getQueriesData<Paginated<ChatMessage>>({
    queryKey: chatKeys.messages(conversationId),
  });
  for (const [, data] of caches) {
    const found = data?.items.find((m) => m.id === messageId);
    if (found) return found;
  }
  return undefined;
}

/** Локальный прогноз надгробия (правило следа сервер подтвердит/опровергнет). */
export function predictTombstone(m: ChatMessage): ChatMessage {
  return {
    ...m,
    text: '',
    attachments: [],
    reactions: [],
    reply: null,
    pinned: false,
    deletedAt: new Date().toISOString(),
  };
}

/** Прогноз «есть живые ответы» по кэшу (#163, правило следа «по ответам»):
 *  ответ (reply.id) или пост треда (threadRootId = цель), не удалённые.
 *  Кэш — окно ленты/тредов: ответ вне окна прогноз врёт — истину ставит
 *  реконсиляция по ответу сервера (204/200) и инвалидация. */
export function cachedHasLiveReplies(
  qc: QueryClient,
  conversationId: string,
  messageId: string,
): boolean {
  const caches = qc.getQueriesData<Paginated<ChatMessage>>({
    queryKey: chatKeys.messages(conversationId),
  });
  for (const [, data] of caches) {
    for (const m of data?.items ?? []) {
      if (m.id === messageId || m.deletedAt !== null) continue;
      if (m.reply?.id === messageId || m.threadRootId === messageId) return true;
    }
  }
  return false;
}

export type CacheSnapshot = [readonly unknown[], unknown][];

export function snapshotMessages(qc: QueryClient, conversationId: string): CacheSnapshot {
  return qc.getQueriesData({ queryKey: chatKeys.messages(conversationId) });
}

export function restoreSnapshot(qc: QueryClient, snapshot: CacheSnapshot): void {
  for (const [key, data] of snapshot) {
    qc.setQueryData(key as readonly unknown[], data);
  }
}
