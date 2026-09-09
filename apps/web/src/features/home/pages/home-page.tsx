import { useState } from 'react';
import type { CompanyNewsItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { Skeleton } from '@nodus/ui/components/skeleton';

import { useAuthStore } from '../../../shared/auth-store.js';
import type { SourceRect } from '../../../app/shell/slider-panel.js';
import { useHomeSummary } from '../api/home-api.js';
import { HomeBirthdays } from '../components/home-birthdays.js';
import { HomeLabor } from '../components/home-labor.js';
import { HomeNews } from '../components/home-news.js';
import { HomeReader } from '../components/home-reader.js';
import { HomeStats } from '../components/home-stats.js';
import { HomeTopOvertime } from '../components/home-top-overtime.js';

/** Главная в теме «Инструмент»: плоская лента компании на node-панелях,
 * моно-метки, ридер новости — слайдер с раскрытием из карточки. */
export function HomePage() {
  const { data, isLoading } = useHomeSummary();
  const me = useAuthStore((s) => s.user);
  const [reader, setReader] = useState<{
    item: CompanyNewsItem;
    source?: SourceRect;
  } | null>(null);

  const hour = new Date().getHours();
  const greet =
    hour >= 5 && hour < 11
      ? ui.home.greetMorning
      : hour >= 11 && hour < 17
        ? ui.home.greetAfternoon
        : ui.home.greetEvening;
  const today = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  return (
    <div className="relative h-full overflow-y-auto">
      <header className="px-6 pt-6 pb-1">
        <h1 className="text-xl font-semibold text-foreground">
          {greet}, {me?.displayName.split(' ')[0]}
        </h1>
        <p className="mt-0.5 font-mono text-[12px] tracking-[0.08em] text-muted-foreground first-letter:uppercase">
          {today}
        </p>
      </header>

      {isLoading || !data ? (
        <div className="flex flex-col gap-6 p-6">
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      ) : (
        <div className="flex flex-col gap-6 p-6">
          <HomeStats stats={data.stats} />
          <div>
            <NodeLabel label={ui.home.newsTitle} className="px-1" />
            <div className="mt-4 grid grid-cols-[minmax(0,1fr)_340px] items-start gap-6">
              <HomeNews news={data.news} onOpen={(item, source) => setReader({ item, source })} />
              <div className="flex flex-col gap-5">
                <HomeLabor weeks={data.labor.weeks} />
                <HomeTopOvertime entries={data.labor.topOvertime} />
                <HomeBirthdays birthdays={data.birthdays} />
              </div>
            </div>
          </div>
        </div>
      )}
      {reader ? (
        <HomeReader item={reader.item} sourceRect={reader.source} onClose={() => setReader(null)} />
      ) : null}
    </div>
  );
}
