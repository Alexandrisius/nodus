import { ui } from '@nodus/contracts';

import { useAuthStore } from '../../../shared/auth-store.js';
import { firstNameOf } from '../../../shared/lib/format.js';

/**
 * Приветствие по времени суток + дата строкой. На главной живёт в пустой
 * полосе топбара ВНУТРИ мягкой рамы (вердикт владельца 12.09.2026: «занять
 * область приветствием, элементы ленты поднимутся выше»); одной строкой
 * (baseline), чтобы помещаться в h-14 топбара.
 *
 * #132: обращение ПО ИМЕНИ (раньше split(' ')[0] displayName брал фамилию —
 * «Добрый день, Климович»); диапазоны владельца: до 12 — утро, до 18 — день,
 * до 24 — вечер, после 00 — ночь (раньше 00–05 проваливались в «вечер»).
 */
export function HomeGreeting() {
  const me = useAuthStore((s) => s.user);
  const hour = new Date().getHours();
  const greet =
    hour >= 5 && hour < 12
      ? ui.home.greetMorning
      : hour >= 12 && hour < 18
        ? ui.home.greetAfternoon
        : hour >= 18 && hour < 24
          ? ui.home.greetEvening
          : ui.home.greetNight;
  const today = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  return (
    <div className="flex min-w-0 items-baseline gap-3">
      <h1 className="truncate text-lg font-semibold text-foreground">
        {greet}
        {me ? `, ${firstNameOf(me.displayName)}` : null}
      </h1>
      <span className="truncate text-xs text-muted-foreground first-letter:uppercase">{today}</span>
    </div>
  );
}
