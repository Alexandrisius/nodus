import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type {
  ConversationVaultPage,
  FavoriteSources,
  VaultCounts,
  VaultItem,
  VaultItemType,
} from '@nodus/contracts';

import { api } from '../api-client.js';
import { chatKeys } from './api.js';
import { favoriteKeys } from './favorites-api.js';

/**
 * API-слой витрины беседы (#211): серверные списки вложений/ссылок панели
 * «О чате» (НЕ лента — вложение за пределами загруженного окна видно) и
 * источники «Избранного» (Ф3). Панель — read-only: мутаций нет, живость —
 * WS-инвалидациями `chat.message_*` / `chat.favorite_*`.
 */

export const vaultKeys = {
  all: [...chatKeys.all, 'vault'] as const,
  /** Секция витрины: беседа + тип (счётчики приезжают в каждом ответе). */
  list: (conversationId: string, type: VaultItemType, threadRootId: string | null) =>
    [...vaultKeys.all, 'list', conversationId, type, threadRootId] as const,
  /** Счётчики категорий (панель-профиль, реф Telegram). */
  counts: (conversationId: string) => [...vaultKeys.all, 'counts', conversationId] as const,
};

/** Источники «Избранного» (панель чата «Избранное», Ф3). */
export const favoriteSourcesKey = [...favoriteKeys.all, 'sources'] as const;

/** Счётчики категорий витрины — O(1) из денормализованных stats (модель
 *  Telegram getSearchCounters); WS-инвалидации message_* накрывают префиксом. */
export function useConversationVaultCounts(conversationId: string) {
  return useQuery({
    queryKey: vaultKeys.counts(conversationId),
    queryFn: () => api<VaultCounts>(`/chat/conversations/${conversationId}/attachments/counts`),
  });
}

/** Страницы секции витрины (картинки/видео/аудио/файлы/ссылки). */
export function useConversationVault(
  conversationId: string,
  type: VaultItemType,
  threadRootId: string | null,
  enabled = true,
) {
  return useInfiniteQuery({
    queryKey: vaultKeys.list(conversationId, type, threadRootId),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ type, limit: '60' });
      if (pageParam) params.set('cursor', pageParam as string);
      if (threadRootId) params.set('threadRootId', threadRootId);
      return api<ConversationVaultPage>(
        `/chat/conversations/${conversationId}/attachments?${params.toString()}`,
      );
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
  });
}

/** Сводка источников «Избранного» текущего пользователя. */
export function useFavoriteSources() {
  return useQuery({
    queryKey: favoriteSourcesKey,
    queryFn: () => api<FavoriteSources>('/chat/favorites/sources'),
  });
}

/** Плоский список элементов секции (склейка страниц). */
export function vaultItems(query: ReturnType<typeof useConversationVault>): VaultItem[] {
  return (query.data?.pages ?? []).flatMap((page) => page.items);
}
