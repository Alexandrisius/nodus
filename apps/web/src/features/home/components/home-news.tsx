import { Newspaper } from 'lucide-react';
import type { CompanyNewsItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

const df = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });

/** Новости компании: корпоративная витрина вместо социальной ленты. */
export function HomeNews({ news }: { news: CompanyNewsItem[] }) {
  return (
    <section className="rounded-xl border bg-card p-5 shadow-lg shadow-black/20">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <span className="flex size-7 items-center justify-center rounded-lg bg-sky-400/15 text-sky-500">
          <Newspaper className="size-4" />
        </span>
        {ui.home.newsTitle}
      </h2>
      <div className="mt-3 divide-y">
        {news.map((item) => (
          <article key={item.id} className="py-3 first:pt-0 last:pb-0">
            <div className="text-xs text-muted-foreground first-letter:uppercase">
              {df.format(new Date(item.publishedAt))}
            </div>
            <h3 className="mt-0.5 text-sm font-semibold">{item.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{item.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
