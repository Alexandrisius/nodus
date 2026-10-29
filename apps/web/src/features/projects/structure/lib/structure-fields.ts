import { ui } from '@nodus/contracts';

import { LEADING_COL_W } from '../../../../shared/views/row-menu.js';
import type { FieldDef, ViewField } from '../../../../shared/views/use-view-fields.js';

/** Реестр колонок таблицы структуры (#467): узлы заполняют шифр/план/факт/
 *  сроки/прогресс поддерева, задачи — стадию/ответственного/срок/факт; общие
 *  колонки — единая сетка разнородных строк (шапка не кастомизируется
 *  отдельным реестром — это вид вкладки, не журнала). */
export const STRUCTURE_VIEW_KEY = 'projects.structure';

export const structureFields: FieldDef[] = [
  {
    id: 'name',
    label: ui.structure.columnName,
    defaultVisible: true,
    defaultWidth: 380,
    minWidth: 220,
    maxWidth: 640,
    locked: true,
  },
  {
    id: 'code',
    label: ui.structure.columnCode,
    defaultVisible: true,
    defaultWidth: 72,
    minWidth: 56,
    maxWidth: 128,
  },
  {
    id: 'stage',
    label: ui.tasks.fieldStage,
    defaultVisible: true,
    defaultWidth: 128,
    minWidth: 116,
  },
  {
    id: 'assignee',
    label: ui.tasks.assignee,
    defaultVisible: true,
    defaultWidth: 160,
    minWidth: 110,
  },
  {
    id: 'deadline',
    label: ui.tasks.deadline,
    defaultVisible: true,
    defaultWidth: 172,
    minWidth: 140,
  },
  {
    id: 'plan',
    label: ui.structure.columnPlan,
    defaultVisible: true,
    defaultWidth: 88,
    minWidth: 64,
  },
  {
    id: 'fact',
    label: ui.structure.columnFact,
    defaultVisible: true,
    defaultWidth: 88,
    minWidth: 64,
  },
  {
    id: 'nearest',
    label: ui.structure.columnNearest,
    defaultVisible: true,
    defaultWidth: 124,
    minWidth: 96,
  },
  {
    id: 'latest',
    label: ui.structure.columnLatest,
    defaultVisible: true,
    defaultWidth: 124,
    minWidth: 96,
  },
  {
    id: 'progress',
    label: ui.structure.columnProgress,
    defaultVisible: true,
    defaultWidth: 96,
    minWidth: 72,
  },
];

/** Общий трек сетки строк и хедера: ведущая колонка + ширины полей вида. */
export function structureGrid(fields: readonly ViewField<FieldDef>[]): string {
  return `${LEADING_COL_W}px ${fields.map((f) => `${f.width ?? 120}px`).join(' ')}`;
}
