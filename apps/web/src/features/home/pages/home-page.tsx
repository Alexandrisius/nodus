import { SendHorizonal } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Skeleton } from '@nodus/ui/components/skeleton';
import { Textarea } from '@nodus/ui/components/textarea';

import { useAuthStore } from '../../../shared/auth-store.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { useHomeSummary, usePublishFeedPost } from '../api/home-api.js';
import { FeedPostCard } from '../components/feed-post.js';
import { HomeWidgets } from '../components/home-widgets.js';

/** Главная: рабочий кабинет — лента слева, полезные виджеты справа. */
export function HomePage() {
  const { data, isLoading } = useHomeSummary();
  const publish = usePublishFeedPost();
  const me = useAuthStore((s) => s.user);
  const [text, setText] = useState('');

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || publish.isPending) return;
    setText('');
    publish.mutate(trimmed);
  }

  return (
    <div className="relative h-full overflow-y-auto">
      <div className="grid grid-cols-[1fr_360px] gap-5 p-5">
        <div className="flex min-w-0 flex-col gap-4">
          <form
            onSubmit={onSubmit}
            className="flex items-start gap-3 rounded-xl border bg-card p-4 shadow-sm"
          >
            <PersonAvatar name={me?.displayName ?? ''} className="size-10" />
            <div className="flex-1">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={ui.home.feedPlaceholder}
                rows={2}
                className="resize-none border-none shadow-none focus-visible:ring-0"
              />
              <div className="mt-2 flex justify-end">
                <Button type="submit" size="sm" disabled={!text.trim()}>
                  <SendHorizonal data-icon="inline-start" />
                  {ui.tasks.send}
                </Button>
              </div>
            </div>
          </form>

          {isLoading
            ? [0, 1].map((i) => <Skeleton key={i} className="h-40" />)
            : (data?.feed ?? []).map((post) => <FeedPostCard key={post.id} post={post} />)}
        </div>

        {data && <HomeWidgets summary={data} />}
      </div>
    </div>
  );
}
