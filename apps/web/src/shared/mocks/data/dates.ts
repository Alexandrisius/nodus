/** Демо-даты относительно «сейчас», чтобы концепт всегда выглядел живым. */

export function isoIn(days: number, hour = 18, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

export function isoDateIn(days: number): string {
  return isoIn(days).slice(0, 10);
}

export function isoAgo(days: number, hour = 10, minute = 0): string {
  return isoIn(-days, hour, minute);
}
