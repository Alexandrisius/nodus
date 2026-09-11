import { ArrowRight, MessageSquare, ThumbsUp } from 'lucide-react';
import type { MouseEvent } from 'react';
import type { CompanyNewsItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import type { SourceRect } from '../../../app/shell/slider-panel.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';

const df = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });

/** Лента компании: плоские посты-панели; клик открывает ридер-слайдер,
 * раскрывающийся из rect карточки (shared-element). */
export function HomeNews({
  news,
  onOpen,
}: {
  news: CompanyNewsItem[];
  onOpen: (item: CompanyNewsItem, source?: SourceRect) => void;
}) {
  function handleOpen(item: CompanyNewsItem, event: MouseEvent<HTMLButtonElement>) {
    const card = event.currentTarget.closest('article');
    const rect = card?.getBoundingClientRect();
    onOpen(
      item,
      rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : undefined,
    );
  }

  return (
    <section className="flex flex-col gap-4">
      {news.map((item) => (
        <article key={item.id} className="node-panel">
          <button
            type="button"
            onClick={(e) => handleOpen(item, e)}
            className="block w-full p-5 text-left transition-colors hover:bg-accent/60"
          >
            <div className="flex items-center gap-3">
              <PersonAvatar name={item.author.displayName} className="size-10" />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{item.author.displayName}</div>
                <div className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground first-letter:uppercase">
                  {df.format(new Date(item.publishedAt))}
                </div>
              </div>
            </div>
            <h3 className="mt-3 text-base font-semibold">{item.title}</h3>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.text}</p>
            <span className="mt-3 inline-flex items-center gap-1.5 font-mono text-[11px] font-medium tracking-[0.14em] text-foreground/80 uppercase">
              {ui.home.readMore}
              <ArrowRight className="size-3.5" strokeWidth={1.75} />
            </span>
          </button>
          <div className="flex items-center gap-5 border-t border-border px-5 py-2.5 font-mono text-[11px] text-muted-foreground tabular-nums">
            <span className="flex items-center gap-1.5">
              <ThumbsUp className="size-3.5" strokeWidth={1.75} />
              {item.likesCount}
            </span>
            <span className="flex items-center gap-1.5">
              <MessageSquare className="size-3.5" strokeWidth={1.75} />
              {item.commentsCount}
            </span>
          </div>
        </article>
      ))}
    </section>
  );
}
