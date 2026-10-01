import { HomeBirthdays } from '../features/home/components/home-birthdays.js';
import { HomeLabor } from '../features/home/components/home-labor.js';
import { HomeStats } from '../features/home/components/home-stats.js';
import { HomeTopOvertime } from '../features/home/components/home-top-overtime.js';
import { useHomeSummary } from '../features/home/api/home-api.js';
import { HomeFeedPage } from '../features/notifications/pages/home-feed-page.js';

/**
 * Маршрут «Главная» (#100, фидбек владельца 01.10): прежняя витрина компании
 * — метрики сверху, справа трудозатраты/переработки/дни рождения, — но
 * центральная колонка (бывшая новостная лента) теперь ЛЕНТА УВЕДОМЛЕНИЙ.
 * Витрина живёт на реальном `GET /home/summary` (модуль home бэка) и рендерит
 * каркас ВСЕГДА (вердикт владельца 01.10: «видеть каждый день дизайн, справа
 * блоки пусть с нулями, ширина ленты как на dev»): блоки без данных показывают
 * заглушку вместо скрытия, сетка колонок постоянна.
 */
export function HomeRoute() {
  const home = useHomeSummary();
  const data = home.data;
  const top = data ? <HomeStats stats={data.stats} /> : null;
  return (
    <HomeFeedPage
      top={top}
      rail={
        <>
          <HomeLabor weeks={data?.labor.weeks ?? []} />
          <HomeTopOvertime entries={data?.labor.topOvertime ?? []} />
          <HomeBirthdays birthdays={data?.birthdays ?? []} />
        </>
      }
    />
  );
}
