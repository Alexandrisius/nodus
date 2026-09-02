import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FeedPost, HomeSummary } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { api } from '../../../shared/api-client.js';
import { useAuthStore } from '../../../shared/auth-store.js';

export const homeKeys = {
  all: ['home'] as const,
  summary: () => [...homeKeys.all, 'summary'] as const,
};

export function useHomeSummary() {
  return useQuery({
    queryKey: homeKeys.summary(),
    queryFn: () => api<HomeSummary>('/home/summary'),
  });
}

/** Публикация в ленту — оптимистично (I4). */
export function usePublishFeedPost() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: (text: string) => api<FeedPost>('/home/feed', { method: 'POST', body: { text } }),

    onMutate: async (text) => {
      await queryClient.cancelQueries({ queryKey: homeKeys.summary() });
      const previous = queryClient.getQueryData<HomeSummary>(homeKeys.summary());
      const temp: FeedPost = {
        id: `temp-${crypto.randomUUID()}`,
        author: { id: user?.id ?? '', displayName: user?.displayName ?? '', avatarUrl: null },
        text,
        likesCount: 0,
        commentsCount: 0,
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData<HomeSummary>(homeKeys.summary(), (old) =>
        old ? { ...old, feed: [temp, ...old.feed] } : old,
      );
      return { previous, tempId: temp.id };
    },

    onError: (_error, _text, context) => {
      if (context?.previous) queryClient.setQueryData(homeKeys.summary(), context.previous);
      toast.error(ui.common.sendError);
    },

    onSuccess: (server, _text, context) => {
      queryClient.setQueryData<HomeSummary>(homeKeys.summary(), (old) =>
        old ? { ...old, feed: old.feed.map((p) => (p.id === context?.tempId ? server : p)) } : old,
      );
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: homeKeys.summary() });
    },
  });
}
