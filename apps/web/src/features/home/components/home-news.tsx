import { MessageSquare, ThumbsUp } from 'lucide-react';
import type { CompanyNewsItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { PersonAvatar } from '../../../shared/ui/person-avatar.js';

const df = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });

const sketchOf: Record<string, string> = {
  'c0000000-0000-4000-8000-000000000101': '/sketches/news-mayak.png',
  'c0000000-0000-4000-8000-000000000102': '/sketches/news-cake.png',
  'c0000000-0000-4000-8000-000000000103': '/sketches/news-bim.png',
  'c0000000-0000-4000-8000-000000000104': '/sketches/news-crane.png',
};

/** Лента компании: крупные посты-«бумага» с карандашным рисунком справа;
 * клик открывает ридер. */
export function HomeNews({
  news,
  onOpen,
}: {
  news: CompanyNewsItem[];
  onOpen: (item: CompanyNewsItem) => void;
}) {
  return (
    <section className="flex flex-col gap-5">
      {news.map((item) => (
        <article key={item.id} className="paper-card sketch-tilt p-5">
          <button
            type="button"
            onClick={() => onOpen(item)}
            className="flex w-full items-start gap-5 text-left"
          >
            <div className="min-w-0 flex-1">
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
              <p className="mt-1 line-clamp-2 text-sm text-card-foreground/75">{item.text}</p>
              <span className="mt-2 inline-block text-sm font-medium text-rust underline underline-offset-4">
                {ui.home.readMore}
              </span>
            </div>
            {sketchOf[item.id] && (
              <img
                src={sketchOf[item.id]}
                alt=""
                className="h-40 w-52 shrink-0 rotate-1 object-cover object-center mix-blend-multiply opacity-95"
              />
            )}
          </button>
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
