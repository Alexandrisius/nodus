import { ui } from '@nodus/contracts';

import { LEADING_COL_W } from '../../../../shared/views/row-menu.js';
import type { FieldDef, ViewField } from '../../../../shared/views/use-view-fields.js';

/** Реестр колонок таблицы структуры (#467): узлы заполняют шифр/часы/сроки/
 *  прогресс поддерева, задачи — стадию/ответственного/срок/факт; общие
 *  колонки — единая сетка разнородных строк (проводник: у папок и файлов
 *  одни колонки, пустые ячейки просто пустые, без дефисов). По умолчанию —
 *  шесть колонок; шифр и поздний срок — в шестерёнке. */
export const STRUCTURE_VIEW_KEY = 'projects.structure.v2';

export const structureFields: FieldDef[] = [
  {
    id: 'name',
    label: ui.structure.columnName,
    defaultVisible: true,
    defaultWidth: 300,
    minWidth: 220,
    maxWidth: 640,
    locked: true,
  },
  {
    id: 'progress',
    label: ui.structure.columnProgress,
    defaultVisible: true,
    defaultWidth: 96,
    minWidth: 80,
  },
  {
    id: 'hours',
    label: ui.structure.columnHours,
    defaultVisible: true,
    defaultWidth: 112,
    minWidth: 96,
  },
  {
    id: 'deadline',
    label: ui.structure.columnDeadline,
    defaultVisible: true,
    defaultWidth: 120,
    minWidth: 100,
  },
  {
    id: 'assignee',
    label: ui.tasks.assignee,
    defaultVisible: true,
    defaultWidth: 136,
    minWidth: 104,
  },
  {
    id: 'stage',
    label: ui.tasks.fieldStage,
    defaultVisible: true,
    defaultWidth: 120,
    minWidth: 112,
  },
  {
    id: 'code',
    label: ui.structure.columnCode,
    defaultVisible: false,
    defaultWidth: 80,
    minWidth: 56,
    maxWidth: 128,
  },
  {
    id: 'latest',
    label: ui.structure.columnLatest,
    defaultVisible: false,
    defaultWidth: 120,
    minWidth: 96,
  },
];

/** Общий трек сетки строк и хедера: ведущая колонка + колонка графа + поля. */
export function structureGrid(
  fields: readonly ViewField<FieldDef>[],
  graphWidthPx: number,
): string {
  return `${LEADING_COL_W}px ${graphWidthPx}px ${fields
    .map((f) => `${f.width ?? 120}px`)
    .join(' ')}`;
}
