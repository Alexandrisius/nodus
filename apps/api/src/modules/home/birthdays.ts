import type { BirthdayEntry } from '@nodus/contracts';

/** Строка справочника, достаточная для выбора дней рождения. */
export interface BirthdayUserRow {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  birthDate: Date;
}

/**
 * Ближайшие дни рождения (чистая функция, #100): годовщина month/day в окне
 * [сегодня; сегодня+окно], «сегодня» — флаг; сортировка по близости, лимит.
 * 29 февраля в невисокосный год естественно съезжает на 1 марта
 * (переполнение Date) — человек из списка не теряется.
 */
export function pickUpcomingBirthdays(
  users: BirthdayUserRow[],
  today = new Date(),
  windowDays = 14,
  limit = 8,
): BirthdayEntry[] {
  const ty = today.getFullYear();
  const tIndex = Date.UTC(ty, today.getMonth(), today.getDate());
  const entries: Array<{ entry: BirthdayEntry; daysUntil: number }> = [];
  for (const u of users) {
    const bm = u.birthDate.getUTCMonth();
    const bd = u.birthDate.getUTCDate();
    let anniversary = new Date(Date.UTC(ty, bm, bd));
    if (Number.isNaN(anniversary.getTime())) continue;
    if (anniversary.getTime() < tIndex) {
      anniversary = new Date(Date.UTC(ty + 1, bm, bd));
    }
    const daysUntil = Math.round((anniversary.getTime() - tIndex) / 86_400_000);
    if (daysUntil > windowDays) continue;
    entries.push({
      daysUntil,
      entry: {
        user: { id: u.id, displayName: u.displayName, avatarUrl: u.avatarUrl },
        birthDate: u.birthDate.toISOString().slice(0, 10),
        isToday: daysUntil === 0,
      },
    });
  }
  return entries
    .sort(
      (a, b) =>
        a.daysUntil - b.daysUntil ||
        a.entry.user.displayName.localeCompare(b.entry.user.displayName),
    )
    .slice(0, limit)
    .map((e) => e.entry);
}
