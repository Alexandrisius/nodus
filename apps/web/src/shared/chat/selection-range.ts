/**
 * Чистая логика мультивыбора сообщений (A6, #87): диапазон Shift+клик
 * (канон Gmail — в Telegram Desktop его нет, feature request #24616) и
 * лимит пакета 100 (серверный лимит Telegram — у нас ЯВНЫЙ, не молчаливый).
 */

export const SELECTION_LIMIT = 100;

/** Закрытый интервал между якорем и целью в порядке ленты. */
export function rangeBetween(
  orderedIds: readonly string[],
  anchorId: string,
  targetId: string,
): string[] {
  const a = orderedIds.indexOf(anchorId);
  const b = orderedIds.indexOf(targetId);
  if (a < 0 || b < 0) return [targetId];
  const from = Math.min(a, b);
  const to = Math.max(a, b);
  return orderedIds.slice(from, to + 1);
}

/** Добавление ids к выделению с лимитом: capped=true — уперлись в потолок
 *  (лишнее отбрасывается, вызывающий код показывает явное сообщение). */
export function withSelection(
  current: readonly string[],
  add: readonly string[],
  limit: number = SELECTION_LIMIT,
): { ids: string[]; capped: boolean } {
  const merged = [...new Set([...current, ...add])];
  if (merged.length <= limit) return { ids: merged, capped: false };
  return { ids: merged.slice(0, limit), capped: true };
}
