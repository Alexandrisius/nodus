import { useState } from 'react';
import type { CompanyNewsItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { Skeleton } from '@nodus/ui/components/skeleton';

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
  const [reader, setReader] = useState<{
    item: CompanyNewsItem;
    source?: SourceRect;
  } | null>(null);

  return (
    <div className="relative h-full overflow-y-auto">
      {/* Приветствие — в полосе топбара (HomeGreeting), лента начинается
          выше (вердикт владельца 12.09.2026). */}
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
            <div className="mt-4 grid grid-cols-[minmax(0,1fr)_21.25rem] items-start gap-6">
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
