import { MessageSquare, ThumbsUp } from 'lucide-react';
import type { CompanyNewsItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { PersonAvatar } from '../../../shared/ui/person-avatar.js';

const df = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });

/** Лента компании: посты-«бумага» с автором и счётчиками, как в концепте. */
export function HomeNews({ news }: { news: CompanyNewsItem[] }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold tracking-wider text-foreground/60 uppercase">
        {ui.home.newsTitle}
      </h2>
      {news.map((item) => (
        <article key={item.id} className="paper-card p-5">
          <div className="flex items-center gap-3">
            <PersonAvatar name={item.author.displayName} className="size-10" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{item.author.displayName}</div>
              <div className="text-xs text-card-foreground/55 first-letter:uppercase">
                {df.format(new Date(item.publishedAt))}
              </div>
            </div>
          </div>
          <h3 className="mt-3 text-base font-semibold">{item.title}</h3>
          <p className="mt-1 text-sm text-card-foreground/75">{item.text}</p>
          <div className="mt-3 flex items-center gap-5 text-sm text-card-foreground/60">
            <span className="flex items-center gap-1.5">
              <ThumbsUp className="size-4 text-rust" />
              {item.likesCount}
            </span>
            <span className="h-4 w-px bg-pencil/30" />
            <span className="flex items-center gap-1.5">
              <MessageSquare className="size-4 text-tealink" />
              {item.commentsCount}
            </span>
          </div>
        </article>
      ))}
    </section>
  );
}
