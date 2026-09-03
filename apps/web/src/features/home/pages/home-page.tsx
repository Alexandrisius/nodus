import { ui } from '@nodus/contracts';
import { Skeleton } from '@nodus/ui/components/skeleton';

import { useAuthStore } from '../../../shared/auth-store.js';
import { useHomeSummary } from '../api/home-api.js';
import { HomeBirthdays } from '../components/home-birthdays.js';
import { HomeNews } from '../components/home-news.js';
import { HomeStats } from '../components/home-stats.js';

/** Главная — лента компании на «грифельной доске»: посты-бумага и сводки. */
export function HomePage() {
  const { data, isLoading } = useHomeSummary();
  const me = useAuthStore((s) => s.user);

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
        <p className="text-sm text-foreground/55 first-letter:uppercase">{today}</p>
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
          <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-6">
            <HomeNews news={data.news} />
            <HomeBirthdays birthdays={data.birthdays} />
          </div>
        </div>
      )}
    </div>
  );
}
