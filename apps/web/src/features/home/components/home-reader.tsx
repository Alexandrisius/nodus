import { MessageSquare, ThumbsUp } from 'lucide-react';
import type { CompanyNewsItem } from '@nodus/contracts';

import { SliderPanel, type SourceRect } from '../../../app/shell/slider-panel.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';

const df = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

/** Ридер новости: слайдер, раскрывающийся из карточки ленты (shared-element). */
export function HomeReader({
  item,
  sourceRect,
  onClose,
}: {
  item: CompanyNewsItem;
  sourceRect?: SourceRect;
  onClose: () => void;
}) {
  return (
    <SliderPanel sourceRect={sourceRect} onClose={onClose} title={item.title}>
      <article className="mx-auto h-full max-w-3xl overflow-y-auto px-8 py-8">
        <h2 className="text-2xl font-semibold text-foreground">{item.title}</h2>
        <div className="mt-3 flex items-center gap-2.5">
          <PersonAvatar name={item.author.displayName} className="size-8" />
          <span className="text-sm font-medium">{item.author.displayName}</span>
          <span className="text-xs text-muted-foreground first-letter:uppercase">
            {df.format(new Date(item.publishedAt))}
          </span>
        </div>
        <p className="mt-6 text-sm leading-relaxed whitespace-pre-wrap text-foreground/85">
          {item.text}
        </p>
        <div className="mt-8 flex items-center gap-5 border-t border-border pt-4 font-mono text-label-sm text-muted-foreground tabular-nums">
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
    </SliderPanel>
  );
}
