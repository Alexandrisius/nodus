import type { CreationFieldSlot, CustomFieldDefinition, MoneyValue } from '@nodus/contracts';
import { customFieldIdOfKey, ui } from '@nodus/contracts';

import {
  formatDuration,
  formatIsoDate,
  formatIsoDateTime,
  formatMoney,
  formatNumber,
} from '../../../shared/custom-fields/value-format.js';

/**
 * Сводка строки поля в панели «Окно создания» (#432, Р12): одна строка
 * под названием — вид поля и его режим. «Системное поле», «Дата ·
 * обязательно», «Скрыто: Высокий». Скрытое значение показывается
 * человеческим текстом (имя сотрудника, название проекта, формат числа и
 * даты), а не id. Строка есть всегда — высота строки не прыгает, когда
 * поле становится обязательным (баг-вердикт владельца 26.10.2026).
 */

const c = ui.automation.creation;
const MAX_TEXT = 40;

export interface SlotSummaryContext {
  /** Определение атрибута для слота `cf.<id>` (нет — атрибут удалён). */
  definition?: CustomFieldDefinition;
  userName: (id: string) => string | undefined;
  projectName: (id: string) => string | undefined;
}

const clip = (text: string) => (text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text);

/** Имена сотрудников: до двух и «+N». */
function people(ids: readonly string[], ctx: SlotSummaryContext): string {
  const names = ids.map(ctx.userName).filter((name): name is string => Boolean(name));
  if (names.length === 0) return `${c.summaryPeople} ${ids.length}`;
  const head = names.slice(0, 2).join(', ');
  return ids.length > 2 ? `${head} +${ids.length - 2}` : head;
}

/** Скрытое значение текстом; пусто — `null` (значение ещё не выбрано). */
export function presetText(slot: CreationFieldSlot, ctx: SlotSummaryContext): string | null {
  const value = slot.preset;
  if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) return null;
  const known = (name: string | undefined) => name ?? c.summaryPresetSet;

  if (customFieldIdOfKey(slot.key) === null) {
    switch (slot.key) {
      case 'description':
        return clip(String(value));
      case 'priority':
        return ui.tasks.priority[value as keyof typeof ui.tasks.priority] ?? String(value);
      case 'assignee':
        return known(ctx.userName(String(value)));
      case 'coexecutors':
      case 'observers':
        return Array.isArray(value) ? people(value, ctx) : c.summaryPresetSet;
      case 'project':
        return known(ctx.projectName(String(value)));
      default:
        return c.summaryPresetSet;
    }
  }

  const definition = ctx.definition;
  if (!definition) return c.summaryPresetSet;
  switch (definition.type) {
    case 'text':
    case 'long_text':
    case 'link':
      return clip(String(value));
    case 'number':
      return formatNumber(Number(value), definition.settings.precision ?? 0);
    case 'money':
      return formatMoney(value as MoneyValue, null);
    case 'date':
      return formatIsoDate(String(value));
    case 'datetime':
      return formatIsoDateTime(String(value));
    case 'duration':
      return formatDuration(Number(value));
    case 'bool':
      return value === true ? c.presetBool : c.summaryPresetSet;
    case 'user':
      return known(ctx.userName(String(value)));
    case 'users':
      return Array.isArray(value) ? people(value, ctx) : c.summaryPresetSet;
    case 'project':
      return known(ctx.projectName(String(value)));
    default:
      return c.summaryPresetSet;
  }
}

/** Сводка строки: скрытое — «Скрыто: <значение>»; иначе вид поля и
 *  «обязательно», если оно обязательно при создании. */
export function slotSummary(slot: CreationFieldSlot, ctx: SlotSummaryContext): string {
  if (slot.preset !== null) {
    return `${c.summaryHidden}: ${presetText(slot, ctx) ?? c.summaryPresetEmpty}`;
  }
  const kind =
    customFieldIdOfKey(slot.key) === null
      ? c.summarySystem
      : ctx.definition
        ? ui.customFields.types[ctx.definition.type]
        : c.unknownAttribute;
  return slot.required ? `${kind} · ${c.summaryRequired}` : kind;
}
