import { ui } from '@nodus/contracts';

import { useAuthStore } from '../../../shared/auth-store.js';

/**
 * Приветствие по времени суток + дата строкой. На главной живёт в пустой
 * полосе топбара ВНУТРИ мягкой рамы (вердикт владельца 12.09.2026: «занять
 * область приветствием, элементы ленты поднимутся выше»); одной строкой
 * (baseline), чтобы помещаться в h-14 топбара.
 */
export function HomeGreeting() {
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
    <div className="flex min-w-0 items-baseline gap-3">
      <h1 className="truncate text-lg font-semibold text-foreground">
        {greet}, {me?.displayName.split(' ')[0]}
      </h1>
      <span className="truncate text-xs text-muted-foreground first-letter:uppercase">{today}</span>
    </div>
  );
}
