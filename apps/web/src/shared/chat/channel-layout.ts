import type { NodeEdgePoint } from '@nodus/ui/components/node-edge';
import { edgeDurations, snapPx } from '@nodus/ui/components/node-edge';

/** Минимум ЛЕНТЫ канала при открытом окне треда: посты сжимаются (w-full
 *  max-w-2xl), вердикт владельца 11.09.2026 — перегородка должна ходить
 *  влево дальше прежних 360, сообщения канала при этом сжимаются. */
export const MIN_FEED_W = 320;
/** Минимум окна треда: корневой пост + ответы читаемы (композер h-16). */
export const MIN_THREAD_W = 320;
/** Порог двух зон: уже — drill-down (тред заменяет ленту, «К ленте»). */
export const MIN_SIDE_BY_SIDE = MIN_FEED_W + MIN_THREAD_W;
export const THREAD_DEFAULT_W = 440;
export const THREAD_MAX_W = 720;
/** Порт окна треда — центр его шапки h-12. */
export const THREAD_PORT_Y = 24;

export const FLASH_DRAW_CAP_S = 0.35;
export const FLASH_PULSE_CAP_S = 0.9;

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

/**
 * Точки ребра связи/вспышки «пост → окно треда» в координатах контейнера
 * канала (грамматика контура: ортогональ, локоть скруглённый): правый край
 * поста на оси источника (threadLinkSource) → локоть в середине зазора →
 * порт левого края окна треда на оси его шапки. ВСЕ ВХОДЫ — viewport-
 * абсолютные координаты (source.x/y и portX = левый край окна треда);
 * локальными их делает только эта функция. Двойной вычет container.left
 * однажды увёл порт в середину ленты (вердикт валидатора #42; регрессионный
 * тест с container.left ≠ 0 проверяет ПОСЛЕДНЮЮ точку). При `pinned` (пост
 * целиком за краем ленты) линия ОБРЫВАЕТСЯ на кромке: вертикаль от кромки до
 * порта, без горизонтали к посту и без точки источника (вердикт владельца).
 */
export function threadLinkPoints(
  source: { x: number; y: number; pinned: 'top' | 'bottom' | null },
  container: { left: number; top: number },
  portX: number,
): NodeEdgePoint[] {
  // snapPx — канон примитива: прямые сегменты hairline-рёбер снапятся к
  // полупикселю устройства (равномерная яркость на любом DPR/зуме); NodeEdge
  // снап НЕ делает — это обязанность вызывающего.
  const sx = snapPx(source.x - container.left);
  const sy = snapPx(source.y - container.top);
  const px = snapPx(portX - container.left);
  const py = snapPx(THREAD_PORT_Y);
  const ex = snapPx(Math.round((sx + px) / 2));
  if (source.pinned) {
    return [
      { x: ex, y: sy },
      { x: ex, y: py },
      { x: px, y: py },
    ];
  }
  return [
    { x: sx, y: sy },
    { x: ex, y: sy },
    { x: ex, y: py },
    { x: px, y: py },
  ];
}

/** Затухание вспышки: рисовка + пробег пульса + догорание. Длительности —
 *  из edgeDurations примитива NodeEdge (caps сверху): на широкоформатном
 *  мониторе импульс идёт быстрее, но остаётся читаемым (вердикт владельца
 *  по скрину-концепту). */
export function flashFadeMs(len: number): number {
  const { draw, pulse } = edgeDurations(len, {
    draw: FLASH_DRAW_CAP_S,
    pulse: FLASH_PULSE_CAP_S,
  });
  return (draw + pulse + 0.6) * 1000;
}

/** Область «Этот тред» панели беседы: корень + его ответы (файлы/ссылки). */
export function threadScopeMessages<T extends { id: string; threadRootId: string | null }>(
  items: T[],
  threadRootId: string,
): T[] {
  return items.filter((m) => m.threadRootId === threadRootId || m.id === threadRootId);
}

/** Источник связи треда. Пост ВИДИМ ЦЕЛИКОМ — точка на оси его строки
 *  действий (порт источника). Любая часть поста за краем ленты (частично
 *  скрыт или целиком) — `pinned`: связь не прячется при скролле (вердикт
 *  владельца: связь ПОКАЗЫВАЕТ, из какого поста открытый тред, и помогает
 *  найти пост), но линия ОБРЫВАЕТСЯ на верхней/нижней кромке ленты БЕЗ
 *  горизонтали и БЕЗ точки (точка на кромке/срезе читалась ложным узлом —
 *  вердикт владельца): сегмент обрыва идёт вдоль кромки ВНУТРИ контейнера
 *  канала, за его пределы (шапка страницы, композер) ребро не выходит. */
export function threadLinkSource(
  source: { top: number; bottom: number },
  feed: { top: number; bottom: number },
  offset = 24,
): { y: number; pinned: 'top' | 'bottom' | null } {
  if (source.top >= feed.top && source.bottom <= feed.bottom) {
    return { y: source.bottom - offset, pinned: null };
  }
  return source.top < feed.top
    ? { y: feed.top, pinned: 'top' }
    : { y: feed.bottom, pinned: 'bottom' };
}
