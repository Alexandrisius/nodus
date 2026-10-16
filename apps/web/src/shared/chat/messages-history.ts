import type { QueryClient } from '@tanstack/react-query';
import type { ChatMessage, Paginated } from '@nodus/contracts';

import { api } from '../api-client.js';
import { chatKeys } from './chat-keys.js';
import type { HistoryPage } from './feed-merge.js';

/**
 * Догрузка истории сообщений (#307): страница старее границы кэша (курсор =
 * nextCursor текущей страницы — серверная граница «самое старое загруженное»)
 * преппендится в ТОТ ЖЕ плоский кэш, форма не меняется. Бэк полностью готов
 * (beforeSeq, ASC, трэды — корень только на первой странице). Первое окно —
 * limit=100 (chat-queries.ts), дальше — страничками по 50 (модель Telegram).
 */

/** Размер страницы догрузки. */
const OLDER_PAGE_LIMIT = 50;

/** Полёты в работе (дедуп по ключу): sentinel и jump-backfill не соревнуются. */
const inflight = new Map<string, Promise<boolean>>();

function historyKey(conversationId: string, threadRootId: string | null): readonly unknown[] {
  return threadRootId
    ? chatKeys.thread(conversationId, threadRootId)
    : chatKeys.messages(conversationId);
}

/** Есть ли в кэше граница истории (nextCursor !== null). */
export function hasOlderMessages(
  queryClient: QueryClient,
  conversationId: string,
  threadRootId: string | null = null,
): boolean {
  const data = queryClient.getQueryData<Paginated<ChatMessage>>(
    historyKey(conversationId, threadRootId),
  );
  return (data?.nextCursor ?? null) !== null;
}

/**
 * Загрузить следующую страницу истории и преппендить её в кэш. Повторные
 * вызовы по одному ключу — один общий полёт. true — страница ДАЛА прогресс
 * (в кэше появились новые записи; резидент прыжка #307 по false завершает
 * бэкфилл тостом, не подвешивая запрос). false — грузить нечего (границы
 * нет / кэш не готов / сеть отказала / страница пуста — повторит следующий
 * триггер; курсор при этом обновляется — исчерпание фиксируется в кэше).
 */
export function ensureOlderPage(
  queryClient: QueryClient,
  conversationId: string,
  threadRootId: string | null = null,
): Promise<boolean> {
  const key = historyKey(conversationId, threadRootId);
  const existing = inflight.get(key.join('\u0000'));
  if (existing) return existing;
  const run = (async (): Promise<boolean> => {
    const current = queryClient.getQueryData<Paginated<ChatMessage>>(key);
    if (!current || !current.nextCursor) return false;
    const params = new URLSearchParams({
      limit: String(OLDER_PAGE_LIMIT),
      cursor: current.nextCursor,
    });
    if (threadRootId) params.set('threadRootId', threadRootId);
    let page: Paginated<ChatMessage>;
    try {
      page = await api<Paginated<ChatMessage>>(
        `/chat/conversations/${conversationId}/messages?${params.toString()}`,
      );
    } catch {
      return false;
    }
    let progressed = false;
    queryClient.setQueryData<HistoryPage>(key, (old) => {
      if (!old) return page;
      // Граница могла уехать параллельным вызовом: преппендим только новое,
      // дедуп по id — повтор безопасен. Маркер истории — самое старое из
      // загруженного (первое сообщение свежеполученной страницы).
      const known = new Set(old.items.map((m) => m.id));
      const fresh = page.items.filter((m) => !known.has(m.id));
      progressed = fresh.length > 0;
      const oldestLoaded = page.items[0]?.seq;
      const marker =
        oldestLoaded !== undefined
          ? Math.min(old.oldestLoadedSeq ?? Number.POSITIVE_INFINITY, oldestLoaded)
          : old.oldestLoadedSeq;
      return {
        items: [...fresh, ...old.items],
        nextCursor: page.nextCursor,
        ...(marker !== undefined && Number.isFinite(marker) ? { oldestLoadedSeq: marker } : {}),
      };
    });
    return progressed;
  })();
  inflight.set(key.join('\u0000'), run);
  void run.finally(() => inflight.delete(key.join('\u0000')));
  return run;
}
