import { Heart, MessageSquare } from 'lucide-react';
import type { FeedPost } from '@nodus/contracts';

import { formatDateTime } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';

export function FeedPostCard({ post }: { post: FeedPost }) {
  return (
    <article className="rounded-xl border bg-card p-4 shadow-sm">
      <header className="flex items-center gap-3">
        <PersonAvatar name={post.author.displayName} className="size-10" />
        <div>
          <div className="text-sm font-semibold">{post.author.displayName}</div>
          <div className="text-xs text-muted-foreground">{formatDateTime(post.createdAt)}</div>
        </div>
      </header>
      <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap wrap-break-word">
        {post.text}
      </p>
      <footer className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Heart className="size-4" />
          {post.likesCount}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MessageSquare className="size-4" />
          {post.commentsCount}
        </span>
      </footer>
    </article>
  );
}
