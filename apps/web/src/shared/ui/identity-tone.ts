import type { ProjectColor } from '@nodus/contracts';

/** Цвет-идентичность сущности (проект) → классы плитки/точки на categorical-
 *  токенах --chart-* своей темы (цвет = смысл: маркер идентичности, не декор;
 *  hex в разметке запрещён, I15). Плитка — пастельный тонированный квадрат
 *  с цветным глифом и hairline-бордюром того же тона: контраст проходит в
 *  обеих темах (референс команды владельца — цветные маркеры проектов). */
export const identityTone: Record<ProjectColor, { tile: string; dot: string }> = {
  blue: { tile: 'border-chart-1/30 bg-chart-1/12 text-chart-1', dot: 'bg-chart-1' },
  green: { tile: 'border-chart-2/30 bg-chart-2/12 text-chart-2', dot: 'bg-chart-2' },
  amber: { tile: 'border-chart-3/30 bg-chart-3/12 text-chart-3', dot: 'bg-chart-3' },
  pink: { tile: 'border-chart-4/30 bg-chart-4/12 text-chart-4', dot: 'bg-chart-4' },
  sky: { tile: 'border-chart-5/30 bg-chart-5/12 text-chart-5', dot: 'bg-chart-5' },
  terra: { tile: 'border-chart-6/30 bg-chart-6/12 text-chart-6', dot: 'bg-chart-6' },
};

/** Циклическая палитра рядов категориальных графиков (бары по исполнителям,
 *  переработки): статичные имена классов — Tailwind не собирает динамику. */
export const chartRowTones = [
  'bg-chart-1',
  'bg-chart-2',
  'bg-chart-3',
  'bg-chart-4',
  'bg-chart-5',
  'bg-chart-6',
] as const;

/** Тон ряда категориального графика по индексу (цикл палитры). */
export function chartRowTone(index: number): string {
  return chartRowTones[index % chartRowTones.length] ?? 'bg-chart-1';
}
