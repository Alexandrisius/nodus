import { uiPx } from '../ui/ui-scale.js';

/** Минимум ЛЕНТЫ канала при открытом окне треда: посты сжимаются (w-full
 *  max-w-2xl), вердикт владельца 11.09.2026 — перегородка должна ходить
 *  влево дальше прежних 360, сообщения канала при этом сжимаются. */
export const MIN_FEED_W = uiPx(320);
/** Минимум окна треда: корневой пост + ответы читаемы (композер h-16). */
export const MIN_THREAD_W = uiPx(320);
/** Порог двух зон: уже — drill-down (тред заменяет ленту, «К ленте»). */
export const MIN_SIDE_BY_SIDE = MIN_FEED_W + MIN_THREAD_W;
export const THREAD_DEFAULT_W = uiPx(440);
export const THREAD_MAX_W = uiPx(720);

/** Две зоны (лента + окно треда) помещаются при данной ширине контейнера. */
export function isSideBySide(containerW: number): boolean {
  return containerW >= MIN_SIDE_BY_SIDE;
}

/** Эффективная ширина окна треда: память пользователя, но лента не уже
 *  минимума (контейнер сузился — окно ужимается вслед). */
export function threadWidth(width: number, containerW: number): number {
  return Math.min(width, Math.max(containerW - MIN_FEED_W, MIN_THREAD_W));
}

/** Живой верхний предел ширины окна треда: потолок THREAD_MAX_W (тред не
 *  шире ленты в разы — Slack-паттерн, вердикт валидатора #42), пол —
 *  MIN_THREAD_W, между ними — контейнер минус лента минус 1px перегородки.
 *  ЕДИНСТВЕННАЯ формула предела: channel-view и тесты считают из неё. */
export function threadMaxW(containerW: number): number {
  return Math.min(THREAD_MAX_W, Math.max(containerW - MIN_FEED_W - 1, MIN_THREAD_W));
}

/** Область «Этот тред» панели беседы: корень + его ответы (файлы/ссылки). */
export function threadScopeMessages<T extends { id: string; threadRootId: string | null }>(
  items: T[],
  threadRootId: string,
): T[] {
  return items.filter((m) => m.threadRootId === threadRootId || m.id === threadRootId);
}
