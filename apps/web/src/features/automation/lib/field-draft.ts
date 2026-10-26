import type {
  CreateCustomFieldBody,
  CustomFieldDefault,
  CustomFieldDefinition,
  CustomFieldRef,
  CustomFieldScope,
  CustomFieldSettings,
  CustomFieldType,
  DictionaryItem,
  UpdateCustomFieldBody,
} from '@nodus/contracts';
import { typeIdsOf } from '@nodus/contracts';

import {
  baseTypeOf,
  familyModifier,
  familyOf,
  modifierOf,
  typeWithModifier,
  type FieldFamily,
} from './field-type-families.js';

/**
 * Черновик окна атрибута (#431, ревизия UI 25.10.2026): окно правит
 * черновик, сервер получает изменения только по «Создать»/«Сохранить»
 * (раньше — автосохранение по уходу фокуса). Здесь — чистые функции:
 * начальный черновик, тип из семейства и модификатора, тела API, проверка.
 * Умолчание списка — отметка на варианте (модель Битрикс24 «По умолч.»),
 * для остальных типов — значение редактором карточки.
 */

/** Вариант списка в черновике: id сервера или временный (`draft:`);
 *  удалённый вариант просто исчезает из массива. */
export interface OptionDraft {
  id: string;
  name: string;
}

export const DRAFT_PREFIX = 'draft:';

export type DefaultMode = 'none' | 'static' | 'author_department';

export interface FieldDraft {
  family: FieldFamily | null;
  /** Модификатор семейства включён: многострочный / несколько значений. */
  modifier: boolean;
  name: string;
  hint: string;
  settings: Pick<CustomFieldSettings, 'precision' | 'currencyId'>;
  /** Режим умолчания не-списка: «Значение» без выбранного значения — ещё
   *  не умолчание (сохранится как «нет»). */
  defaultMode: DefaultMode;
  /** Умолчание не-списка (у списка — `defaultOptionIds`). */
  defaultValue: CustomFieldDefault | null;
  /** Ссылки выбранного умолчания (имя сотрудника и т.п. до ответа сервера). */
  defaultRefs: CustomFieldRef[];
  options: OptionDraft[];
  defaultOptionIds: string[];
  hidden: boolean;
  reportIndexed: boolean;
  /** Типы процессов, которым принадлежит атрибут (#432, В2): пусто — нигде
   *  не показывается. У проектов и контрагентов поля нет — список остаётся пустым. */
  typeIds: string[];
}

export const emptyDraft: FieldDraft = {
  family: null,
  modifier: false,
  name: '',
  hint: '',
  settings: {},
  defaultMode: 'none',
  defaultValue: null,
  defaultRefs: [],
  options: [],
  defaultOptionIds: [],
  hidden: false,
  reportIndexed: false,
  typeIds: [],
};

export function isListFamily(family: FieldFamily | null): boolean {
  return family === 'list';
}

export function draftType(draft: FieldDraft): CustomFieldType | null {
  if (!draft.family) return null;
  const modifier = familyModifier(draft.family);
  return draft.modifier && modifier
    ? typeWithModifier(draft.family, modifier)
    : baseTypeOf(draft.family);
}

/** Черновик из сохранённого атрибута; варианты — из справочника поля. */
export function draftOf(
  definition: CustomFieldDefinition,
  items: readonly DictionaryItem[],
): FieldDraft {
  const family = familyOf(definition.type);
  const list = isListFamily(family);
  const value = definition.defaultValue?.kind === 'static' ? definition.defaultValue.value : null;
  return {
    family,
    modifier: modifierOf(definition.type) !== null,
    name: definition.name,
    hint: definition.hint ?? '',
    settings: {
      ...(definition.settings.precision !== undefined
        ? { precision: definition.settings.precision }
        : {}),
      ...(definition.settings.currencyId !== undefined
        ? { currencyId: definition.settings.currencyId }
        : {}),
    },
    defaultMode: list ? 'none' : (definition.defaultValue?.kind ?? 'none'),
    defaultValue: list ? null : definition.defaultValue,
    defaultRefs: definition.defaultRefs,
    options: items.map((item) => ({ id: item.id, name: item.name })),
    defaultOptionIds: !list
      ? []
      : Array.isArray(value)
        ? value.filter((id): id is string => typeof id === 'string')
        : typeof value === 'string'
          ? [value]
          : [],
    hidden: definition.hidden,
    reportIndexed: definition.reportIndexed,
    typeIds: typeIdsOf(definition),
  };
}

/** Смена семейства в окне создания: настройки и умолчание прежнего типа
 *  не переносятся (у «Числа» нет валюты, у «Текста» — вариантов). */
export function withFamily(draft: FieldDraft, family: FieldFamily): FieldDraft {
  if (draft.family === family) return draft;
  return {
    ...draft,
    family,
    modifier: false,
    settings: family === 'number' ? { precision: 0 } : {},
    defaultMode: 'none',
    defaultValue: null,
    defaultRefs: [],
    defaultOptionIds: [],
    options: family === 'list' ? draft.options : [],
  };
}

/** Временное определение для редактора умолчания (та же грамматика, что в карточке). */
export function draftDefinition(
  draft: FieldDraft,
  scope: CustomFieldScope,
  currencyFallback: string | null,
): CustomFieldDefinition | null {
  const type = draftType(draft);
  if (!type) return null;
  const now = new Date(0).toISOString();
  return {
    id: '00000000-0000-4000-8000-000000000000',
    scope,
    type,
    name: draft.name || '—',
    hint: null,
    settings:
      type === 'money'
        ? { currencyId: draft.settings.currencyId ?? currencyFallback }
        : type === 'number'
          ? { precision: draft.settings.precision ?? 0 }
          : {},
    dictionary: null,
    defaultValue: null,
    defaultRefs: [],
    reportIndexed: false,
    hidden: false,
    typeIds: draft.typeIds,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export type DraftIssue = 'name' | 'family' | 'options' | 'optionsDuplicate';

/** Что мешает сохранить (кнопка неактивна, подсказка у поля). */
export function draftIssues(draft: FieldDraft): DraftIssue[] {
  const issues: DraftIssue[] = [];
  if (draft.name.trim().length === 0) issues.push('name');
  if (!draft.family) issues.push('family');
  if (isListFamily(draft.family)) {
    const names = draft.options.map((option) => option.name.trim().toLowerCase());
    if (names.length === 0 || names.some((name) => name.length === 0)) issues.push('options');
    if (new Set(names).size !== names.length) issues.push('optionsDuplicate');
  }
  return issues;
}

/** Умолчание не-списка: режим «Нет» сбрасывает выбранное значение. */
export function scalarDefault(draft: FieldDraft): CustomFieldDefault | null {
  return draft.defaultMode === 'none' ? null : draft.defaultValue;
}

/** Умолчание списка из отмеченных вариантов (временные id → серверные). */
export function listDefault(
  draft: FieldDraft,
  type: CustomFieldType,
  ids: ReadonlyMap<string, string>,
): CustomFieldDefault | null {
  const kept = new Set(draft.options.map((option) => option.id));
  const picked = draft.defaultOptionIds.filter((id) => kept.has(id)).map((id) => ids.get(id) ?? id);
  if (picked.length === 0) return null;
  return { kind: 'static', value: type === 'multienum' ? picked : picked[0]! };
}

function settingsOf(draft: FieldDraft, type: CustomFieldType): CustomFieldSettings {
  if (type === 'number') return { precision: draft.settings.precision ?? 0 };
  if (type === 'money') return { currencyId: draft.settings.currencyId ?? null };
  return {};
}

export function createBody(
  draft: FieldDraft,
  scope: CustomFieldScope,
  extra: { dictionaryId?: string; defaultValue?: CustomFieldDefault | null },
): CreateCustomFieldBody {
  const type = draftType(draft)!;
  const hint = draft.hint.trim();
  return {
    scope,
    type,
    name: draft.name.trim(),
    ...(hint ? { hint } : {}),
    settings: extra.dictionaryId ? { dictionaryId: extra.dictionaryId } : settingsOf(draft, type),
    defaultValue: extra.defaultValue !== undefined ? extra.defaultValue : scalarDefault(draft),
    reportIndexed: draft.reportIndexed,
    hidden: draft.hidden,
    ...(draft.typeIds.length > 0 ? { typeIds: draft.typeIds } : {}),
  };
}

/** Тело правки — только изменённые ключи (null — правок нет). */
export function patchBody(
  definition: CustomFieldDefinition,
  draft: FieldDraft,
  defaultValue: CustomFieldDefault | null,
): UpdateCustomFieldBody | null {
  const type = draftType(draft)!;
  const body: UpdateCustomFieldBody = {};
  const name = draft.name.trim();
  const hint = draft.hint.trim() || null;
  if (name !== definition.name) body.name = name;
  if (hint !== definition.hint) body.hint = hint;
  if (type !== definition.type) body.type = type;
  if (type === 'number' && (draft.settings.precision ?? 0) !== (definition.settings.precision ?? 0))
    body.settings = { precision: draft.settings.precision ?? 0 };
  if (type === 'money' && draft.settings.currencyId !== definition.settings.currencyId)
    body.settings = { currencyId: draft.settings.currencyId ?? null };
  if (JSON.stringify(defaultValue) !== JSON.stringify(definition.defaultValue))
    body.defaultValue = defaultValue;
  if (draft.hidden !== definition.hidden) body.hidden = draft.hidden;
  if (JSON.stringify(draft.typeIds) !== JSON.stringify(typeIdsOf(definition)))
    body.typeIds = draft.typeIds;
  if (draft.reportIndexed !== definition.reportIndexed) body.reportIndexed = draft.reportIndexed;
  return Object.keys(body).length > 0 ? body : null;
}
