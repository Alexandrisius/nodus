import type { TaskSystemState } from '@nodus/contracts';

/**
 * Раскладка холста схем (#378, канон nodus-ui-style «Холст схем»): этапы —
 * ФИКСИРОВАННЫЕ колонки слева направо, статусы встают в свою колонку по
 * `sortOrder` (решение владельца: «статусы сами встают по этапам»). Чистая
 * функция — одинаковые координаты в редакторе и «Схеме маршрута».
 */

export const BAND_ORDER: readonly TaskSystemState[] = [
  'backlog',
  'active',
  'paused',
  'done',
  'closed',
];

/** Геометрия холста, дизайн-px (масштаб — зумом React Flow, не токенами). */
export const BAND_GEOMETRY = {
  /** Ширина колонки этапа. */
  width: 232,
  /** Зазор между колонками. */
  gap: 24,
  /** Высота заголовка колонки внутри её поля. */
  headerHeight: 44,
  /** Карточка статуса. */
  stageWidth: 200,
  stageHeight: 56,
  /** Вертикальный ритм статусов. */
  stageGap: 20,
  /** Минимальная высота колонки (пустой этап читается). */
  minHeight: 240,
  /** Внутренние поля колонки по горизонтали (центрирование карточки). */
  padX: 16,
} as const;

export interface BandSlotInput {
  id: string;
  systemState: TaskSystemState;
  sortOrder: number;
}

export interface StageSlot {
  id: string;
  /** Колонка этапа (родитель-группа React Flow). */
  bandId: string;
  systemState: TaskSystemState;
  /** Позиция относительно колонки (parentId), слоты по вертикали. */
  x: number;
  y: number;
  /** Порядковый номер в колонке (по sortOrder, устойчиво по id). */
  index: number;
}

export interface BandColumn {
  id: string;
  systemState: TaskSystemState;
  /** Абсолютная позиция колонки на холсте. */
  x: number;
  y: number;
  width: number;
  height: number;
  stageIds: string[];
}

export interface BandLayout {
  bands: BandColumn[];
  stages: StageSlot[];
}

/** Стабильная сортировка статусов колонки: по sortOrder, при равенстве — по id. */
function bySortOrder(a: BandSlotInput, b: BandSlotInput): number {
  return a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : 1);
}

/** Высота колонки по числу статусов (пустой этап — minHeight). */
export function bandHeight(stageCount: number): number {
  const g = BAND_GEOMETRY;
  const content = g.headerHeight + stageCount * (g.stageHeight + g.stageGap);
  return Math.max(g.minHeight, content);
}

export function bandIdOf(systemState: TaskSystemState): string {
  return `band:${systemState}`;
}

/** Статусы → позиции колонок-этапов и слотов (чистая). */
export function layoutBands(stages: readonly BandSlotInput[]): BandLayout {
  const g = BAND_GEOMETRY;
  const byBand = new Map<TaskSystemState, BandSlotInput[]>();
  for (const state of BAND_ORDER) byBand.set(state, []);
  for (const s of stages) {
    const bucket = byBand.get(s.systemState);
    if (bucket) bucket.push(s);
  }

  const bands: BandColumn[] = [];
  const slots: StageSlot[] = [];
  BAND_ORDER.forEach((state, columnIndex) => {
    const members = (byBand.get(state) ?? []).slice().sort(bySortOrder);
    const x = columnIndex * (g.width + g.gap);
    const height = bandHeight(members.length);
    bands.push({
      id: bandIdOf(state),
      systemState: state,
      x,
      y: 0,
      width: g.width,
      height,
      stageIds: members.map((m) => m.id),
    });
    members.forEach((member, index) => {
      slots.push({
        id: member.id,
        bandId: bandIdOf(state),
        systemState: state,
        x: Math.round((g.width - g.stageWidth) / 2),
        y: Math.round(g.headerHeight + index * (g.stageHeight + g.stageGap)),
        index,
      });
    });
  });

  return { bands, stages: slots };
}

/** Индекс слота в колонке по вертикальной координате после перетаскивания
 *  (привязка к слотам на отпускании). */
export function slotIndexAt(layout: BandLayout, stageId: string, y: number): number {
  const slot = layout.stages.find((s) => s.id === stageId);
  if (!slot) return 0;
  const g = BAND_GEOMETRY;
  const raw = Math.round((y - g.headerHeight) / (g.stageHeight + g.stageGap));
  const bandSize = layout.bands.find((b) => b.id === slot.bandId)?.stageIds.length ?? 1;
  return Math.max(0, Math.min(bandSize - 1, raw));
}
