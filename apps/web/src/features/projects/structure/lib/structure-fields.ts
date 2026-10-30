import { ui } from '@nodus/contracts';

import { LEADING_COL_W } from '../../../../shared/views/row-menu.js';
import type { FieldDef, ViewField } from '../../../../shared/views/use-view-fields.js';

/** Реестр колонок таблицы структуры (#467): узлы заполняют шифр/часы/сроки/
 *  прогресс поддерева, задачи — стадию/ответственного/срок/факт; общие
 *  колонки — единая сетка разнородных строк (проводник: у папок и файлов
 *  одни колонки, пустые ячейки просто пустые, без дефисов). План и факт —
 *  отдельные колонки (не одно поле с двумя числами). По умолчанию — пять
 *  колонок, которые влезают в рабочую зону карточки; ответственный, стадия,
 *  шифр и поздний срок — в шестерёнке. */
export const STRUCTURE_VIEW_KEY = 'projects.structure.v2';

export const structureFields: FieldDef[] = [
  {
    id: 'name',
    label: ui.structure.columnName,
    defaultVisible: true,
    defaultWidth: 260,
    minWidth: 220,
    maxWidth: 640,
    locked: true,
  },
  {
    id: 'progress',
    label: ui.structure.columnProgress,
    defaultVisible: true,
    defaultWidth: 84,
    minWidth: 76,
  },
  {
    id: 'plan',
    label: ui.structure.columnPlan,
    defaultVisible: true,
    defaultWidth: 74,
    minWidth: 68,
  },
  {
    id: 'fact',
    label: ui.structure.columnFact,
    defaultVisible: true,
    defaultWidth: 74,
    minWidth: 68,
  },
  {
    id: 'deadline',
    label: ui.structure.columnDeadline,
    defaultVisible: true,
    defaultWidth: 74,
    minWidth: 70,
  },
  {
    id: 'assignee',
    label: ui.tasks.assignee,
    defaultVisible: false,
    defaultWidth: 136,
    minWidth: 104,
  },
  {
    id: 'stage',
    label: ui.tasks.fieldStage,
    defaultVisible: false,
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

/** Общий трек сетки строк и хедера: ведущая колонка + поля. Вложенность —
 *  отступами в ячейке названия (проводник), отдельной колонки графа нет. */
export function structureGrid(fields: readonly ViewField<FieldDef>[]): string {
  return `${LEADING_COL_W}px ${fields.map((f) => `${f.width ?? 120}px`).join(' ')}`;
}
